import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, apiRequest, apiRequestWithoutContent } from "./client.ts";

const itemSchema = z.object({ id: z.number(), title: z.string() });

function stubFetch(response: Response | Error) {
  const fetchMock =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function catchApiError(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api を付けたURLを GET で呼び、応答を返す", async () => {
    const fetchMock = stubFetch(Response.json({ id: 1, title: "テスト書籍" }));

    await expect(apiRequest("/books/1", itemSchema)).resolves.toEqual({
      id: 1,
      title: "テスト書籍",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/books/1", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  });

  it("body を JSON にして送る", async () => {
    const fetchMock = stubFetch(Response.json({ id: 1, title: "テスト書籍" }, { status: 201 }));

    await apiRequest("/books", itemSchema, { method: "POST", body: { title: "テスト書籍" } });

    expect(fetchMock).toHaveBeenCalledWith("/api/books", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ title: "テスト書籍" }),
    });
  });

  it("エラーの応答は detail を持つ ApiError にする", async () => {
    const detail = [
      {
        type: "already_exists",
        loc: ["body", "isbn"],
        msg: "このISBNの本はすでに登録されています",
        ctx: { book_id: 3 },
      },
    ];
    stubFetch(Response.json({ detail }, { status: 409 }));

    const error = await catchApiError(apiRequest("/books", itemSchema, { method: "POST" }));

    expect(error.status).toBe(409);
    expect(error.details).toEqual(detail);
    expect(error.message).toBe("このISBNの本はすでに登録されています");
  });

  it("エラーの本文が JSON でなければ、サーバーのエラーとして扱う", async () => {
    stubFetch(new Response("Internal Server Error", { status: 500 }));

    const error = await catchApiError(apiRequest("/books", itemSchema));

    expect(error.status).toBe(500);
    expect(error.details).toEqual([
      { type: "server_error", loc: [], msg: "サーバーでエラーが起きました" },
    ]);
  });

  it("サーバーに接続できなければ、ステータス 0 の ApiError にする", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    const error = await catchApiError(apiRequest("/books", itemSchema));

    expect(error.status).toBe(0);
    expect(error.message).toBe("サーバーに接続できません");
  });

  it("応答の形が schema と合わなければ ApiError にする", async () => {
    stubFetch(Response.json({ id: "1" }));

    const error = await catchApiError(apiRequest("/books/1", itemSchema));

    expect(error.details[0].type).toBe("invalid_response");
    expect(error.message).toBe("サーバーの応答の形式が正しくありません");
  });
});

describe("apiRequestWithoutContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("本文のない 204 の応答を受け付ける", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    await expect(apiRequestWithoutContent("/books/1", { method: "DELETE" })).resolves.toBe(
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/books/1", {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
  });

  it("エラーの応答は ApiError にする", async () => {
    const detail = [
      { type: "not_found", loc: ["path", "book_id"], msg: "ID 1 の本は見つかりません" },
    ];
    stubFetch(Response.json({ detail }, { status: 404 }));

    const error = await catchApiError(apiRequestWithoutContent("/books/1", { method: "DELETE" }));

    expect(error.status).toBe(404);
    expect(error.details).toEqual(detail);
  });
});
