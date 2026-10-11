import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Book, type BookInput, createBook, fetchBook } from "../api/books.ts";
import { ApiError, type ApiErrorDetail } from "../api/client.ts";
import BookCreatePage from "./BookCreatePage.tsx";
import BookDetailPage from "./BookDetailPage.tsx";

vi.mock("../api/books.ts", () => ({
  createBook: vi.fn(),
  fetchBook: vi.fn(),
}));

const BOOK: Book = {
  id: 1,
  isbn: null,
  title: "テスト書籍",
  author: null,
  publisher: null,
  published_date: null,
  list_price: null,
  cover_image_url: null,
  disposed_on: null,
  created_at: "2026-10-12T03:00:00Z",
};

const EMPTY_INPUT: BookInput = {
  title: "",
  isbn: "",
  author: "",
  publisher: "",
  published_date: "",
  list_price: null,
  cover_image_url: "",
};

/** 登録画面から始め、登録後に移る詳細画面も表示できるようにする */
function renderPage() {
  render(
    <MemoryRouter initialEntries={["/books/new"]}>
      <Routes>
        <Route path="/books/:bookId" element={<BookDetailPage />} />
        <Route path="/books/new" element={<BookCreatePage />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

function rejectWith(status: number, details: ApiErrorDetail[]) {
  vi.mocked(createBook).mockRejectedValue(new ApiError(status, details));
}

describe("BookCreatePage", () => {
  afterEach(() => {
    vi.mocked(createBook).mockReset();
    vi.mocked(fetchBook).mockReset();
  });

  it("入力した値を送る", async () => {
    vi.mocked(createBook).mockResolvedValue(BOOK);
    vi.mocked(fetchBook).mockResolvedValue(BOOK);
    const user = renderPage();

    await user.type(screen.getByLabelText(/書名/), "テスト書籍");
    await user.type(screen.getByLabelText("ISBN"), "978-4-00-310101-8");
    await user.type(screen.getByLabelText("著者"), "著者A,著者B");
    await user.type(screen.getByLabelText("出版社"), "テスト出版");
    await user.type(screen.getByLabelText("出版日"), "2024-05");
    await user.type(screen.getByLabelText("定価（税込・円）"), "1980");
    await user.type(screen.getByLabelText("表紙画像のURL"), "https://example.com/cover.jpg");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(createBook).toHaveBeenCalledWith({
      title: "テスト書籍",
      isbn: "978-4-00-310101-8",
      author: "著者A,著者B",
      publisher: "テスト出版",
      published_date: "2024-05",
      list_price: 1980,
      cover_image_url: "https://example.com/cover.jpg",
    });
  });

  it("登録できたら登録した本の詳細画面に移り、登録したことを表示する", async () => {
    vi.mocked(createBook).mockResolvedValue(BOOK);
    vi.mocked(fetchBook).mockResolvedValue(BOOK);
    const user = renderPage();

    await user.type(screen.getByLabelText(/書名/), "テスト書籍");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(await screen.findByRole("heading", { name: "テスト書籍" })).toBeInTheDocument();
    expect(fetchBook).toHaveBeenCalledWith(BOOK.id);
    expect(screen.getByRole("status")).toHaveTextContent("「テスト書籍」を登録しました");
  });

  it("入力エラーは該当する入力欄の下に表示し、最初の入力欄に移動する", async () => {
    rejectWith(422, [
      { type: "missing", loc: ["body", "title"], msg: "書名を入力してください" },
      { type: "int_parsing", loc: ["body", "list_price"], msg: "定価は整数で入力してください" },
    ]);
    const user = renderPage();

    await user.type(screen.getByLabelText("定価（税込・円）"), "千円");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    const title = screen.getByLabelText(/書名/);
    expect(await screen.findByText("書名を入力してください")).toBeInTheDocument();
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription("書名を入力してください");
    expect(title).toHaveFocus();
    // 数字だけでない定価は、サーバーのエラーを出すため文字列のまま送る
    expect(createBook).toHaveBeenCalledWith({ ...EMPTY_INPUT, list_price: "千円" });
    expect(screen.getByLabelText("定価（税込・円）")).toHaveAccessibleDescription(
      "定価は整数で入力してください",
    );
    expect(screen.getByLabelText("ISBN")).toHaveAttribute("aria-invalid", "false");
  });

  it("ISBNの重複はISBNの入力欄の下に表示する", async () => {
    rejectWith(409, [
      {
        type: "already_exists",
        loc: ["body", "isbn"],
        msg: "このISBNの本はすでに登録されています",
        ctx: { book_id: 3 },
      },
    ]);
    const user = renderPage();

    await user.type(screen.getByLabelText(/書名/), "テスト書籍");
    await user.type(screen.getByLabelText("ISBN"), "9784003101018");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(await screen.findByLabelText("ISBN")).toHaveAccessibleDescription(
      "ハイフンや全角数字を含んでもかまいません。ISBN-10 も入力できます このISBNの本はすでに登録されています",
    );
  });

  it("入力欄に結びつかないエラーはフォームの上に表示する", async () => {
    rejectWith(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]);
    const user = renderPage();

    await user.type(screen.getByLabelText(/書名/), "テスト書籍");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
    // 入力した値は消さない
    expect(screen.getByLabelText(/書名/)).toHaveValue("テスト書籍");
  });

  it("送信中はボタンを押せなくする", async () => {
    vi.mocked(createBook).mockReturnValue(new Promise(() => {}));
    const user = renderPage();

    await user.type(screen.getByLabelText(/書名/), "テスト書籍");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(screen.getByRole("button", { name: "登録中…" })).toBeDisabled();
  });

  it("エラーの後にもう一度送れる", async () => {
    rejectWith(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]);
    const user = renderPage();

    await user.click(screen.getByRole("button", { name: "登録する" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(createBook).toHaveBeenCalledTimes(2);
  });
});
