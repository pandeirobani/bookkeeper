import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client.ts";
import { fetchTsundoku } from "./tsundoku.ts";

const TSUNDOKU = [
  {
    book: { id: 5, title: "テスト書籍", author: "テスト著者" },
    status: "unread",
    first_purchased_on: "2025-03-01",
    first_purchase_amount: 1980,
    purchase_count: 1,
  },
  {
    book: { id: 6, title: "読みかけの本", author: null },
    status: "reading",
    first_purchased_on: "2026-01-10",
    first_purchase_amount: 800,
    purchase_count: 2,
  },
];

describe("fetchTsundoku", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/tsundoku を呼び、積読の本を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(TSUNDOKU));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTsundoku()).resolves.toEqual(TSUNDOKU);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tsundoku",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("積読に入らない読書状態（読了）の応答はエラーにする", async () => {
    const body = [{ ...TSUNDOKU[0], status: "finished" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchTsundoku()).rejects.toBeInstanceOf(ApiError);
  });
});
