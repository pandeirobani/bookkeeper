import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client.ts";
import { lookupIsbn } from "./isbnLookup.ts";

const RESULT = {
  isbn: "9784480683212",
  title: "９９％の人が速くなる走り方",
  author: "平岩時雄",
  publisher: "筑摩書房",
  published_date: "2018-05-08",
  list_price: 924,
  cover_image_url: "https://cover.openbd.jp/9784480683212.jpg",
};

function errorResponse(status: number, type: string, loc: string[], msg: string): Response {
  return Response.json({ detail: [{ type, loc, msg }] }, { status });
}

describe("lookupIsbn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET /api/isbn-lookup を呼び、書誌情報を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(RESULT));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupIsbn("9784480683212")).resolves.toEqual(RESULT);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/isbn-lookup?isbn=9784480683212",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each([
    { isbn: "978-4-480-68321-2", query: "978-4-480-68321-2" },
    { isbn: "978 4480 68321 2", query: "978+4480+68321+2" },
    {
      isbn: "９７８４４８０６８３２１２",
      query: encodeURIComponent("９７８４４８０６８３２１２"),
    },
    { isbn: "", query: "" },
  ])("入力値「$isbn」をそのままエンコードして送る", async ({ isbn, query }) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(RESULT));
    vi.stubGlobal("fetch", fetchMock);

    await lookupIsbn(isbn);
    expect(fetchMock).toHaveBeenCalledWith(`/api/isbn-lookup?isbn=${query}`, expect.anything());
  });

  it("取得できなかった項目が null の結果も受け付ける", async () => {
    const partial = {
      ...RESULT,
      author: null,
      publisher: null,
      published_date: null,
      list_price: null,
      cover_image_url: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(partial)));

    await expect(lookupIsbn("9784480683212")).resolves.toEqual(partial);
  });

  it.each([
    {
      status: 404,
      type: "not_found",
      loc: ["query", "isbn"],
      msg: "このISBNの本は見つかりませんでした。書誌情報を手動で入力してください",
    },
    {
      status: 422,
      type: "value_error",
      loc: ["query", "isbn"],
      msg: "ISBNが正しくありません。番号に入力ミスがないか確認してください",
    },
    {
      status: 502,
      type: "lookup_failed",
      loc: [],
      msg: "書誌情報を取得できませんでした。時間をおいて試すか、手動で入力してください",
    },
    {
      status: 504,
      type: "lookup_timeout",
      loc: [],
      msg: "書誌情報の取得に時間がかかったため中断しました。時間をおいて試すか、手動で入力してください",
    },
  ])("$status のエラーを ApiError にする", async ({ status, type, loc, msg }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(status, type, loc, msg)));

    const error: unknown = await lookupIsbn("9784480683212").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, details: [{ type, loc, msg }] });
  });

  it("応答の形が違えば ApiError にする", async () => {
    const invalid = { ...RESULT, list_price: "924" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(invalid)));

    const error: unknown = await lookupIsbn("9784480683212").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      details: [{ type: "invalid_response", msg: "サーバーの応答の形式が正しくありません" }],
    });
  });
});
