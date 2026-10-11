import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Book, fetchBooks } from "../api/books.ts";
import { ApiError } from "../api/client.ts";
import BookListPage from "./BookListPage.tsx";

vi.mock("../api/books.ts", () => ({
  fetchBooks: vi.fn(),
}));

const BOOK: Book = {
  id: 1,
  isbn: "9784003101018",
  title: "テスト書籍",
  author: "著者A,著者B",
  publisher: "テスト出版",
  published_date: "2024-05",
  list_price: 1980,
  cover_image_url: null,
  disposed_on: null,
  created_at: "2026-10-12T03:00:00Z",
};

function renderPage() {
  render(
    <MemoryRouter>
      <BookListPage />
    </MemoryRouter>,
  );
}

/** 表の本文の行を、セルの文字の配列にする */
function bodyRows(): string[][] {
  const [, body] = within(screen.getByRole("table", { name: "本の一覧" })).getAllByRole("rowgroup");
  return within(body)
    .getAllByRole("row")
    .map((row) => Array.from(row.querySelectorAll("th, td"), (cell) => cell.textContent ?? ""));
}

describe("BookListPage", () => {
  afterEach(() => {
    vi.mocked(fetchBooks).mockReset();
  });

  it("読み込み中と表示する", () => {
    vi.mocked(fetchBooks).mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });

  it("書籍を表の形で表示する", async () => {
    vi.mocked(fetchBooks).mockResolvedValue([
      BOOK,
      {
        ...BOOK,
        id: 2,
        title: "書名だけの本",
        author: null,
        publisher: null,
        published_date: null,
      },
    ]);
    renderPage();

    expect(await screen.findByText("全2冊")).toBeInTheDocument();
    expect(bodyRows()).toEqual([
      ["テスト書籍", "著者A,著者B", "テスト出版", "2024-05", ""],
      ["書名だけの本", "", "", "", ""],
    ]);
  });

  it("手放した本は手放した日を表示する", async () => {
    vi.mocked(fetchBooks).mockResolvedValue([{ ...BOOK, disposed_on: "2026-10-10" }]);
    renderPage();

    await screen.findByText("全1冊");
    expect(bodyRows()[0][4]).toBe("2026/10/10");
  });

  it("前の画面からのメッセージがなければ、メッセージ欄を表示しない", async () => {
    vi.mocked(fetchBooks).mockResolvedValue([BOOK]);
    renderPage();

    await screen.findByText("全1冊");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("本がなければ登録画面への案内を表示する", async () => {
    vi.mocked(fetchBooks).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/まだ本が登録されていません/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "本を登録する" })).toHaveAttribute(
      "href",
      "/books/new",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("取得に失敗したらエラーを表示する", async () => {
    vi.mocked(fetchBooks).mockRejectedValue(
      new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    );
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
  });
});
