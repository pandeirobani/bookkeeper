import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type PurchaseInput,
  createPurchase,
  deletePurchase,
  fetchPurchases,
  updatePurchase,
} from "./purchases.ts";

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

const INPUT: PurchaseInput = {
  purchased_on: "2026-10-01",
  amount: 1980,
  store: "テスト書店",
  memo: "",
};

describe("createPurchase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("入力値を POST /api/books/{id}/purchases に送り、追加した購入記録を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PURCHASE, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPurchase(3, INPUT)).resolves.toEqual(PURCHASE);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/3/purchases",
      expect.objectContaining({ method: "POST", body: JSON.stringify(INPUT) }),
    );
  });
});

describe("updatePurchase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("入力値を PUT /api/purchases/{id} に送り、更新した購入記録を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PURCHASE));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updatePurchase(1, INPUT)).resolves.toEqual(PURCHASE);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/purchases/1",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(INPUT) }),
    );
  });
});

describe("deletePurchase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("DELETE /api/purchases/{id} を呼ぶ", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deletePurchase(1)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/purchases/1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
