import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import App from "./App.tsx";

vi.mock("./api/health.ts", () => ({
  fetchHealth: vi.fn().mockResolvedValue({ status: "ok" }),
}));
vi.mock("./api/books.ts", () => ({
  fetchBooks: vi.fn().mockResolvedValue([]),
}));
vi.mock("./api/expenses.ts", () => ({
  fetchYearlyExpenses: vi.fn().mockResolvedValue([]),
  fetchYearExpenses: vi.fn().mockResolvedValue({ year: 2026, total: 0, count: 0, months: [] }),
}));
vi.mock("./api/tsundoku.ts", () => ({
  fetchTsundoku: vi.fn().mockResolvedValue([]),
}));

function renderApp(path = "/") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  it("アプリ名の見出しを表示する", () => {
    renderApp();

    expect(screen.getByRole("heading", { level: 1, name: "BookKeeper" })).toBeInTheDocument();
  });

  it("バックエンドとの疎通状態を表示する", async () => {
    renderApp();

    expect(await screen.findByText("バックエンド：接続OK")).toBeInTheDocument();
  });

  it("/ では本の一覧を表示し、メニューの「本の一覧」を選択中にする", () => {
    renderApp("/");

    expect(screen.getByRole("heading", { level: 2, name: "本の一覧" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "本の一覧" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "本を登録" })).not.toHaveAttribute("aria-current");
  });

  it("メニューのリンクで画面を切り替える", async () => {
    const user = userEvent.setup();
    renderApp("/");

    await user.click(screen.getByRole("link", { name: "本を登録" }));

    expect(screen.getByRole("heading", { level: 2, name: "本を登録" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "本を登録" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "本の一覧" })).not.toHaveAttribute("aria-current");
  });

  it("メニューの「積読」から積読の画面に移れる", async () => {
    const user = userEvent.setup();
    renderApp("/");

    await user.click(screen.getByRole("link", { name: "積読" }));

    expect(screen.getByRole("heading", { level: 2, name: "積読" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "積読" })).toHaveAttribute("aria-current", "page");
  });

  it("メニューの「書籍費」から書籍費の画面に移れる", async () => {
    const user = userEvent.setup();
    renderApp("/");

    await user.click(screen.getByRole("link", { name: "書籍費" }));

    expect(screen.getByRole("heading", { level: 2, name: "書籍費" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "書籍費" })).toHaveAttribute("aria-current", "page");
  });

  it("存在しないURLでは「ページが見つかりません」を表示する", async () => {
    const user = userEvent.setup();
    renderApp("/unknown");

    expect(screen.getByRole("heading", { name: "ページが見つかりません" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "本の一覧に戻る" }));
    expect(screen.getByRole("heading", { level: 2, name: "本の一覧" })).toBeInTheDocument();
  });
});
