import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.ts";
import { type Tsundoku, fetchTsundoku } from "../api/tsundoku.ts";
import TsundokuPage from "./TsundokuPage.tsx";

vi.mock("../api/tsundoku.ts", () => ({
  fetchTsundoku: vi.fn(),
}));

/** テスト用の積読の本。必要な項目だけ上書きして使う */
function makeTsundoku(overrides: Partial<Tsundoku> = {}): Tsundoku {
  return {
    book: { id: 1, title: "テスト書籍", author: "テスト著者" },
    status: "unread",
    first_purchased_on: "2026-10-01",
    first_purchase_amount: 1980,
    purchase_count: 1,
    ...overrides,
  };
}

function renderPage() {
  render(
    <MemoryRouter>
      <TsundokuPage />
    </MemoryRouter>,
  );
}

/** 表の本文の行を、セルの文字の配列にする */
function bodyRows(): string[][] {
  const [, body] = within(screen.getByRole("table", { name: "積読" })).getAllByRole("rowgroup");
  return within(body)
    .getAllByRole("row")
    .map((row) => Array.from(row.querySelectorAll("th, td"), (cell) => cell.textContent ?? ""));
}

describe("TsundokuPage", () => {
  beforeEach(() => {
    // 積んでいる日数の基準になる「今日」を 2026-10-13 に固定する
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 13, 8, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(fetchTsundoku).mockReset();
  });

  it("読み込み中と表示する", () => {
    vi.mocked(fetchTsundoku).mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });

  it("書名・著者・状態・購入日・積んでいる日数・金額を表で表示する", async () => {
    vi.mocked(fetchTsundoku).mockResolvedValue([
      makeTsundoku({
        book: { id: 5, title: "長く積んでいる本", author: "著者A" },
        first_purchased_on: "2025-10-13",
        first_purchase_amount: 1980,
      }),
      makeTsundoku({
        book: { id: 6, title: "読みかけの本", author: null },
        status: "reading",
        first_purchased_on: "2026-10-13",
        first_purchase_amount: 880,
        purchase_count: 2,
      }),
    ]);
    renderPage();

    await screen.findByRole("table", { name: "積読" });
    expect(bodyRows()).toEqual([
      ["長く積んでいる本", "著者A", "未読", "2025/10/13", "365日", "1,980円"],
      ["読みかけの本", "", "読書中", "2026/10/13", "0日", "880円"],
    ]);
  });

  it("冊数と、最初の購入の金額の合計を表示する", async () => {
    vi.mocked(fetchTsundoku).mockResolvedValue([
      makeTsundoku({ book: { id: 5, title: "本A", author: null }, first_purchase_amount: 1980 }),
      makeTsundoku({ book: { id: 6, title: "本B", author: null }, first_purchase_amount: 880 }),
    ]);
    renderPage();

    expect(await screen.findByText(/^積読 /)).toHaveTextContent("積読 2冊・合計 2,860円");
  });

  it("書名から本の詳細画面に移れる", async () => {
    vi.mocked(fetchTsundoku).mockResolvedValue([
      makeTsundoku({ book: { id: 12, title: "テスト書籍", author: null } }),
    ]);
    renderPage();

    expect(await screen.findByRole("link", { name: "テスト書籍" })).toHaveAttribute(
      "href",
      "/books/12",
    );
  });

  it("購入日が未来の日付でも、積んでいる日数は0日にする", async () => {
    vi.mocked(fetchTsundoku).mockResolvedValue([
      makeTsundoku({ first_purchased_on: "2026-10-20" }),
    ]);
    renderPage();

    await screen.findByRole("table", { name: "積読" });
    expect(bodyRows()[0][4]).toBe("0日");
  });

  it("積読の本がなければ、そのことを表示する", async () => {
    vi.mocked(fetchTsundoku).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("積読の本はありません")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("取得に失敗したらエラーを表示する", async () => {
    vi.mocked(fetchTsundoku).mockRejectedValue(
      new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    );
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
  });
});
