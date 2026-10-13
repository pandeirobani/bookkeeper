import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client.ts";
import { fetchMonthExpenses, fetchYearExpenses, fetchYearlyExpenses } from "./expenses.ts";

const YEARLY = [
  { year: 2026, total: 15400, count: 9 },
  { year: 2025, total: 32100, count: 21 },
];

const YEAR_DETAIL = {
  year: 2026,
  total: 3080,
  count: 2,
  months: Array.from({ length: 12 }, (_, i) =>
    i + 1 === 10 ? { month: 10, total: 3080, count: 2 } : { month: i + 1, total: 0, count: 0 },
  ),
};

const MONTH_DETAIL = {
  year: 2026,
  month: 10,
  total: 3080,
  count: 2,
  purchases: [
    {
      id: 12,
      purchased_on: "2026-10-03",
      amount: 1980,
      store: "テスト書店",
      memo: null,
      book: { id: 5, title: "テスト書籍", author: "テスト著者" },
    },
    {
      id: 13,
      purchased_on: "2026-10-10",
      amount: 1100,
      store: null,
      memo: "古本",
      book: { id: 6, title: "別の本", author: null },
    },
  ],
};

describe("fetchYearlyExpenses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/expenses/yearly を呼び、年ごとの書籍費を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(YEARLY));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchYearlyExpenses()).resolves.toEqual(YEARLY);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/expenses/yearly",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("fetchYearExpenses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/expenses/yearly/{year} を呼び、月ごとの内訳を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(YEAR_DETAIL));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchYearExpenses(2026)).resolves.toEqual(YEAR_DETAIL);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/expenses/yearly/2026",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("fetchMonthExpenses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/expenses/yearly/{year}/months/{month} を呼び、明細を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(MONTH_DETAIL));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMonthExpenses(2026, 10)).resolves.toEqual(MONTH_DETAIL);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/expenses/yearly/2026/months/10",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("明細の本の情報が欠けた応答はエラーにする", async () => {
    const [purchase] = MONTH_DETAIL.purchases;
    const body = { ...MONTH_DETAIL, purchases: [{ ...purchase, book: undefined }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMonthExpenses(2026, 10)).rejects.toBeInstanceOf(ApiError);
  });
});
