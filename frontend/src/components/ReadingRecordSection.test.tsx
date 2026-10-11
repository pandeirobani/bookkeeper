import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.ts";
import {
  type ReadingRecord,
  fetchReadingRecord,
  updateReadingRecord,
} from "../api/readingRecords.ts";
import ReadingRecordSection from "./ReadingRecordSection.tsx";

vi.mock("../api/readingRecords.ts", async (importOriginal) => {
  // 状態の一覧と表示名は本物を使う
  const actual = await importOriginal<typeof import("../api/readingRecords.ts")>();
  return { ...actual, fetchReadingRecord: vi.fn(), updateReadingRecord: vi.fn() };
});

const RECORD: ReadingRecord = {
  id: 1,
  book_id: 3,
  status: "reading",
  started_at: "2026-10-01",
  finished_at: null,
  memo: null,
};

function renderSection() {
  render(<ReadingRecordSection bookId={3} />);
  return userEvent.setup();
}

describe("ReadingRecordSection", () => {
  afterEach(() => {
    vi.mocked(fetchReadingRecord).mockReset();
    vi.mocked(updateReadingRecord).mockReset();
  });

  it("本の読書記録を取得し、入力欄に入れて表示する", async () => {
    vi.mocked(fetchReadingRecord).mockResolvedValue(RECORD);
    renderSection();

    expect(await screen.findByLabelText("状態")).toHaveDisplayValue("読書中");
    expect(fetchReadingRecord).toHaveBeenCalledWith(3);
    expect(screen.getByLabelText("開始日")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("読了日")).toHaveValue("");
    expect(screen.getByLabelText("メモ")).toHaveValue("");
    expect(screen.getByRole("region", { name: "読書記録" })).toBeInTheDocument();
  });

  it("入力した値を送り、保存したことを表示する", async () => {
    vi.mocked(fetchReadingRecord).mockResolvedValue(RECORD);
    vi.mocked(updateReadingRecord).mockResolvedValue({
      ...RECORD,
      status: "finished",
      finished_at: "2026-10-10",
      memo: "面白かった",
    });
    const user = renderSection();

    await user.selectOptions(await screen.findByLabelText("状態"), "読了");
    await user.type(screen.getByLabelText("読了日"), "2026-10-10");
    await user.type(screen.getByLabelText("メモ"), " 面白かった ");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(updateReadingRecord).toHaveBeenCalledWith(3, {
      status: "finished",
      started_at: "2026-10-01",
      finished_at: "2026-10-10",
      memo: " 面白かった ",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("読書記録を保存しました");
    // サーバーで前後の空白を取り除いた値を表示する
    expect(screen.getByLabelText("メモ")).toHaveValue("面白かった");
  });

  it("日付を空欄にしたら null を送る", async () => {
    vi.mocked(fetchReadingRecord).mockResolvedValue(RECORD);
    vi.mocked(updateReadingRecord).mockResolvedValue({ ...RECORD, started_at: null });
    const user = renderSection();

    await user.clear(await screen.findByLabelText("開始日"));
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(updateReadingRecord).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ started_at: null, finished_at: null }),
    );
  });

  it("項目に結びつかないエラー（日付の前後）はフォームの上に表示する", async () => {
    vi.mocked(fetchReadingRecord).mockResolvedValue(RECORD);
    vi.mocked(updateReadingRecord).mockRejectedValue(
      new ApiError(422, [
        { type: "value_error", loc: ["body"], msg: "読了日は開始日以降の日付にしてください" },
      ]),
    );
    const user = renderSection();

    await user.click(await screen.findByRole("button", { name: "保存する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "読了日は開始日以降の日付にしてください",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("項目のエラーは入力欄の下に表示する", async () => {
    vi.mocked(fetchReadingRecord).mockResolvedValue(RECORD);
    vi.mocked(updateReadingRecord).mockRejectedValue(
      new ApiError(422, [
        { type: "value_error", loc: ["body", "memo"], msg: "メモは500文字以内で入力してください" },
      ]),
    );
    const user = renderSection();

    await user.click(await screen.findByRole("button", { name: "保存する" }));

    expect(await screen.findByLabelText("メモ")).toHaveAccessibleDescription(
      "メモは500文字以内で入力してください",
    );
  });

  it("取得に失敗したらエラーを表示する", async () => {
    vi.mocked(fetchReadingRecord).mockRejectedValue(
      new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    );
    renderSection();

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
  });
});
