import { describe, expect, it } from "vitest";
import { ApiError, type ApiErrorDetail } from "./client.ts";
import { splitFieldErrors } from "./fieldErrors.ts";

const FIELDS = ["title", "isbn"] as const;

function apiError(details: ApiErrorDetail[]): ApiError {
  return new ApiError(422, details);
}

describe("splitFieldErrors", () => {
  it("loc が body の項目のエラーは、その項目のメッセージにする", () => {
    const error = apiError([
      { type: "missing", loc: ["body", "title"], msg: "書名を入力してください" },
      { type: "value_error", loc: ["body", "isbn"], msg: "ISBNが正しくありません" },
    ]);

    expect(splitFieldErrors(error, FIELDS)).toEqual({
      fields: { title: ["書名を入力してください"], isbn: ["ISBNが正しくありません"] },
      general: [],
    });
  });

  it("同じ項目に複数のエラーがあれば、すべて残す", () => {
    const error = apiError([
      { type: "a", loc: ["body", "title"], msg: "エラー1" },
      { type: "b", loc: ["body", "title"], msg: "エラー2" },
    ]);

    expect(splitFieldErrors(error, FIELDS).fields).toEqual({ title: ["エラー1", "エラー2"] });
  });

  it("項目に結びつかないエラーは general にする", () => {
    const error = apiError([
      { type: "value_error", loc: ["body"], msg: "読了日は開始日以降の日付にしてください" },
      { type: "network_error", loc: [], msg: "サーバーに接続できません" },
      { type: "not_found", loc: ["path", "book_id"], msg: "ID 1 の本は見つかりません" },
    ]);

    expect(splitFieldErrors(error, FIELDS)).toEqual({
      fields: {},
      general: [
        "読了日は開始日以降の日付にしてください",
        "サーバーに接続できません",
        "ID 1 の本は見つかりません",
      ],
    });
  });

  it("フォームにない項目のエラーは、消えないよう general にする", () => {
    const error = apiError([
      {
        type: "extra_forbidden",
        loc: ["body", "auther"],
        msg: "「auther」という項目は受け付けていません",
      },
    ]);

    expect(splitFieldErrors(error, FIELDS)).toEqual({
      fields: {},
      general: ["「auther」という項目は受け付けていません"],
    });
  });
});
