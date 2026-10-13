import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.ts";
import {
  type ExpensePurchase,
  type MonthExpenseDetail,
  type YearExpenseDetail,
  type YearlyExpense,
  fetchMonthExpenses,
  fetchYearExpenses,
  fetchYearlyExpenses,
} from "../api/expenses.ts";
import ExpensesPage from "./ExpensesPage.tsx";

vi.mock("../api/expenses.ts", () => ({
  fetchYearlyExpenses: vi.fn(),
  fetchYearExpenses: vi.fn(),
  fetchMonthExpenses: vi.fn(),
}));

const YEARLY: YearlyExpense[] = [
  { year: 2026, total: 3080, count: 2 },
  { year: 2025, total: 12000, count: 5 },
];

/** 月ごとの内訳。指定しなかった月は0円・0件 */
function makeYearDetail(
  year: number,
  months: Record<number, { total: number; count: number }> = {},
): YearExpenseDetail {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    ...(months[i + 1] ?? { total: 0, count: 0 }),
  }));
  return {
    year,
    total: rows.reduce((sum, row) => sum + row.total, 0),
    count: rows.reduce((sum, row) => sum + row.count, 0),
    months: rows,
  };
}

/** 月の明細。合計と件数は明細から計算する */
function makeMonthDetail(
  year: number,
  month: number,
  purchases: ExpensePurchase[] = [],
): MonthExpenseDetail {
  return {
    year,
    month,
    total: purchases.reduce((sum, purchase) => sum + purchase.amount, 0),
    count: purchases.length,
    purchases,
  };
}

/** 今のURLのクエリ文字列を表示する。選んだ年と月がURLに入ったかを確かめるため */
function LocationSearch() {
  return <p data-testid="location-search">{useLocation().search}</p>;
}

function renderPage(path = "/expenses") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ExpensesPage />
      <LocationSearch />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

/** 表の本文の行を、セルの文字の配列にする（棒の列は空文字） */
function bodyRows(table: HTMLElement): string[][] {
  const [, body] = within(table).getAllByRole("rowgroup");
  return within(body)
    .getAllByRole("row")
    .map((row) => Array.from(row.querySelectorAll("th, td"), (cell) => cell.textContent ?? ""));
}

function networkError(): ApiError {
  return new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]);
}

describe("ExpensesPage", () => {
  beforeEach(() => {
    // 年の指定がないときの「今年」を固定する
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 13, 8, 0));
    vi.mocked(fetchYearlyExpenses).mockResolvedValue(YEARLY);
    vi.mocked(fetchYearExpenses).mockImplementation((year) =>
      Promise.resolve(makeYearDetail(year)),
    );
    vi.mocked(fetchMonthExpenses).mockImplementation((year, month) =>
      Promise.resolve(makeMonthDetail(year, month)),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(fetchYearlyExpenses).mockReset();
    vi.mocked(fetchYearExpenses).mockReset();
    vi.mocked(fetchMonthExpenses).mockReset();
  });

  describe("年ごとの書籍費", () => {
    it("年・件数・金額を表で表示する", async () => {
      renderPage();

      const table = await screen.findByRole("table", { name: "年ごとの書籍費" });
      expect(bodyRows(table)).toEqual([
        ["2026年", "2件", "3,080円", ""],
        ["2025年", "5件", "12,000円", ""],
      ]);
    });

    it("年から、その年の月額の表示に移れる", async () => {
      renderPage();

      expect(await screen.findByRole("link", { name: "2025年" })).toHaveAttribute(
        "href",
        "/expenses?year=2025",
      );
    });

    it("表示している年を選択中にする", async () => {
      renderPage("/expenses?year=2025");

      expect(await screen.findByRole("link", { name: "2025年" })).toHaveAttribute(
        "aria-current",
        "true",
      );
      expect(screen.getByRole("link", { name: "2026年" })).not.toHaveAttribute("aria-current");
    });

    it("購入記録がなければ、そのことを表示する", async () => {
      vi.mocked(fetchYearlyExpenses).mockResolvedValue([]);
      renderPage();

      expect(await screen.findByText(/まだ購入記録がありません/)).toBeInTheDocument();
      expect(screen.queryByRole("table", { name: "年ごとの書籍費" })).not.toBeInTheDocument();
    });

    it("取得に失敗したらエラーを表示する", async () => {
      vi.mocked(fetchYearlyExpenses).mockRejectedValue(networkError());
      renderPage();

      expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
      // 年の書籍費は表示できる
      expect(
        await screen.findByRole("table", { name: "2026年の月ごとの書籍費" }),
      ).toBeInTheDocument();
    });
  });

  describe("年の書籍費", () => {
    it("年の指定がなければ今年を表示する", async () => {
      renderPage();

      expect(
        await screen.findByRole("heading", { level: 3, name: "2026年の書籍費" }),
      ).toBeInTheDocument();
      expect(fetchYearExpenses).toHaveBeenCalledWith(2026);
    });

    it.each(["0", "10000", "abc", "2025.5"])(
      "URLの年が正しくない（%s）ときは今年を表示する",
      async (value) => {
        renderPage(`/expenses?year=${value}`);

        expect(
          await screen.findByRole("heading", { level: 3, name: "2026年の書籍費" }),
        ).toBeInTheDocument();
      },
    );

    it("年額と、1月から12月までの月額を表示する", async () => {
      vi.mocked(fetchYearExpenses).mockResolvedValue(
        makeYearDetail(2025, { 3: { total: 2860, count: 2 }, 10: { total: 1100, count: 1 } }),
      );
      renderPage("/expenses?year=2025");

      const table = await screen.findByRole("table", { name: "2025年の月ごとの書籍費" });
      expect(screen.getByText(/^年額/)).toHaveTextContent("年額 3,960円（3件）");
      const rows = bodyRows(table);
      expect(rows).toHaveLength(12);
      expect(rows[0]).toEqual(["1月", "0件", "0円", ""]);
      expect(rows[2]).toEqual(["3月", "2件", "2,860円", ""]);
      expect(rows[9]).toEqual(["10月", "1件", "1,100円", ""]);
      expect(fetchYearExpenses).toHaveBeenCalledWith(2025);
    });

    it("前の年・次の年に移れる", async () => {
      const user = renderPage("/expenses?year=2025");
      await screen.findByRole("heading", { level: 3, name: "2025年の書籍費" });

      await user.click(screen.getByRole("link", { name: "次の年" }));

      expect(
        await screen.findByRole("heading", { level: 3, name: "2026年の書籍費" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("location-search")).toHaveTextContent("?year=2026");

      await user.click(screen.getByRole("link", { name: "前の年" }));
      await user.click(screen.getByRole("link", { name: "前の年" }));

      expect(
        await screen.findByRole("heading", { level: 3, name: "2024年の書籍費" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("location-search")).toHaveTextContent("?year=2024");
    });

    it("年ごとの表から年を選ぶと、その年を表示する", async () => {
      const user = renderPage();

      await user.click(await screen.findByRole("link", { name: "2025年" }));

      expect(
        await screen.findByRole("heading", { level: 3, name: "2025年の書籍費" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("location-search")).toHaveTextContent("?year=2025");
    });

    it.each([
      ["1", "前の年"],
      ["9999", "次の年"],
    ])("%s年では「%s」を出さない", async (year, hidden) => {
      renderPage(`/expenses?year=${year}`);

      await screen.findByRole("heading", { level: 3, name: `${year}年の書籍費` });
      expect(screen.queryByRole("link", { name: hidden })).not.toBeInTheDocument();
    });

    it("取得に失敗したらエラーを表示する", async () => {
      vi.mocked(fetchYearExpenses).mockRejectedValue(networkError());
      renderPage();

      expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
      expect(screen.getByRole("heading", { level: 3, name: "2026年の書籍費" })).toBeInTheDocument();
    });
  });

  describe("月の明細", () => {
    const PURCHASES: ExpensePurchase[] = [
      {
        id: 12,
        purchased_on: "2025-10-03",
        amount: 1980,
        store: "テスト書店",
        memo: null,
        book: { id: 5, title: "テスト書籍", author: "テスト著者" },
      },
      {
        id: 13,
        purchased_on: "2025-10-10",
        amount: 1100,
        store: null,
        memo: "古本",
        book: { id: 6, title: "別の本", author: null },
      },
    ];

    it("URLに月がなければ明細を出さない", async () => {
      renderPage("/expenses?year=2025");

      await screen.findByRole("table", { name: "2025年の月ごとの書籍費" });
      expect(screen.queryByRole("heading", { name: /の明細$/ })).not.toBeInTheDocument();
      expect(fetchMonthExpenses).not.toHaveBeenCalled();
    });

    it.each(["0", "13", "01", "abc"])(
      "URLの月が正しくない（%s）ときは明細を出さない",
      async (value) => {
        renderPage(`/expenses?year=2025&month=${value}`);

        await screen.findByRole("table", { name: "2025年の月ごとの書籍費" });
        expect(screen.queryByRole("heading", { name: /の明細$/ })).not.toBeInTheDocument();
        expect(fetchMonthExpenses).not.toHaveBeenCalled();
      },
    );

    it("購入日・書名・購入店・金額と、月の合計を表示する", async () => {
      vi.mocked(fetchMonthExpenses).mockResolvedValue(makeMonthDetail(2025, 10, PURCHASES));
      renderPage("/expenses?year=2025&month=10");

      const table = await screen.findByRole("table", { name: "2025年10月の明細" });
      expect(bodyRows(table)).toEqual([
        ["2025/10/03", "テスト書籍", "テスト書店", "1,980円"],
        ["2025/10/10", "別の本", "", "1,100円"],
      ]);
      expect(screen.getByText(/^合計/)).toHaveTextContent("合計 3,080円（2件）");
      expect(fetchMonthExpenses).toHaveBeenCalledWith(2025, 10);
    });

    it("書名から本の詳細画面に移れる", async () => {
      vi.mocked(fetchMonthExpenses).mockResolvedValue(makeMonthDetail(2025, 10, PURCHASES));
      renderPage("/expenses?year=2025&month=10");

      expect(await screen.findByRole("link", { name: "別の本" })).toHaveAttribute(
        "href",
        "/books/6",
      );
    });

    it("購入記録がない月は、そのことを表示する", async () => {
      renderPage("/expenses?year=2025&month=4");

      expect(await screen.findByText("この月の購入記録はありません")).toBeInTheDocument();
      expect(screen.queryByRole("table", { name: "2025年4月の明細" })).not.toBeInTheDocument();
    });

    it("月額の表の月を選ぶと、その月の明細を開き、URLに月を入れる", async () => {
      vi.mocked(fetchMonthExpenses).mockResolvedValue(makeMonthDetail(2025, 10, PURCHASES));
      const user = renderPage("/expenses?year=2025");

      await user.click(await screen.findByRole("link", { name: "10月" }));

      expect(await screen.findByRole("table", { name: "2025年10月の明細" })).toBeInTheDocument();
      expect(screen.getByTestId("location-search")).toHaveTextContent("?year=2025&month=10");
      expect(screen.getByRole("link", { name: "10月" })).toHaveAttribute("aria-current", "true");
      expect(screen.getByRole("link", { name: "9月" })).not.toHaveAttribute("aria-current");
    });

    it("「明細を閉じる」で明細を閉じ、URLから月を外す", async () => {
      const user = renderPage("/expenses?year=2025&month=10");

      await user.click(await screen.findByRole("link", { name: "明細を閉じる" }));

      expect(screen.queryByRole("heading", { name: /の明細$/ })).not.toBeInTheDocument();
      expect(screen.getByTestId("location-search")).toHaveTextContent(/^\?year=2025$/);
    });

    it("年を切り替えると明細を閉じる", async () => {
      const user = renderPage("/expenses?year=2025&month=10");
      await screen.findByRole("heading", { level: 3, name: "2025年10月の明細" });

      await user.click(screen.getByRole("link", { name: "次の年" }));

      expect(
        await screen.findByRole("heading", { level: 3, name: "2026年の書籍費" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /の明細$/ })).not.toBeInTheDocument();
      expect(screen.getByTestId("location-search")).toHaveTextContent(/^\?year=2026$/);
    });

    it("取得に失敗したらエラーを表示する", async () => {
      vi.mocked(fetchMonthExpenses).mockRejectedValue(networkError());
      renderPage("/expenses?year=2025&month=10");

      expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
      expect(
        screen.getByRole("heading", { level: 3, name: "2025年10月の明細" }),
      ).toBeInTheDocument();
    });
  });
});
