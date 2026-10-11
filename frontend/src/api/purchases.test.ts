import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPurchases } from "./purchases.ts";

const PURCHASE = {
  id: 1,
  book_id: 3,
  purchased_on: "2026-10-01",
  amount: 1980,
  store: "テスト書店",
  memo: null,
  created_at: "2026-10-12T03:00:00Z",
};

describe("fetchPurchases", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/books/{id}/purchases を呼び、購入記録の配列を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([PURCHASE]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPurchases(3)).resolves.toEqual([PURCHASE]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/3/purchases",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
