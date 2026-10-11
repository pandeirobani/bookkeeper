import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBook, updateBook } from "../api/books.ts";
import { ApiError } from "../api/client.ts";
import { useFlashMessage } from "../hooks/useFlashMessage.ts";
import { makeBook } from "../test/fixtures.ts";
import BookEditPage from "./BookEditPage.tsx";

vi.mock("../api/books.ts", async (importOriginal) => {
  // findConflictingBookId は本物を使う
  const actual = await importOriginal<typeof import("../api/books.ts")>();
  return { ...actual, fetchBook: vi.fn(), updateBook: vi.fn() };
});

/** 保存後に移る詳細画面の代わり。URLと受け取ったメッセージを表示する */
function DetailStub() {
  const location = useLocation();
  const message = useFlashMessage();
  return <p>{`詳細画面 ${location.pathname} ${message ?? ""}`}</p>;
}

function renderPage(path = "/books/1/edit") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/books/:bookId" element={<DetailStub />} />
        <Route path="/books/:bookId/edit" element={<BookEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe("BookEditPage", () => {
  afterEach(() => {
    vi.mocked(fetchBook).mockReset();
    vi.mocked(updateBook).mockReset();
  });

  it("登録済みの値を入力欄に入れて表示する", async () => {
    vi.mocked(fetchBook).mockResolvedValue(makeBook({ publisher: null }));
    renderPage();

    expect(await screen.findByLabelText(/書名/)).toHaveValue("テスト書籍");
    expect(screen.getByLabelText("ISBN")).toHaveValue("9784003101018");
    expect(screen.getByLabelText("出版社")).toHaveValue("");
    expect(screen.getByLabelText("定価（税込・円）")).toHaveValue("1980");
    expect(fetchBook).toHaveBeenCalledWith(1);
  });

  it("変更した値を送り、詳細画面に移って更新したことを伝える", async () => {
    vi.mocked(fetchBook).mockResolvedValue(makeBook({ id: 5 }));
    vi.mocked(updateBook).mockResolvedValue(makeBook({ id: 5, title: "新しい書名" }));
    const user = renderPage("/books/5/edit");

    const title = await screen.findByLabelText(/書名/);
    await user.clear(title);
    await user.type(title, "新しい書名");
    await user.clear(screen.getByLabelText("定価（税込・円）"));
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(updateBook).toHaveBeenCalledWith(5, {
      title: "新しい書名",
      isbn: "9784003101018",
      author: "著者A,著者B",
      publisher: "テスト出版",
      published_date: "2024-05",
      list_price: null,
      cover_image_url: "https://example.com/cover.jpg",
    });
    expect(await screen.findByText("詳細画面 /books/5 書誌情報を更新しました")).toBeInTheDocument();
  });

  it("キャンセルで詳細画面に戻れる", async () => {
    vi.mocked(fetchBook).mockResolvedValue(makeBook({ id: 5 }));
    renderPage("/books/5/edit");

    expect(await screen.findByRole("link", { name: "キャンセル" })).toHaveAttribute(
      "href",
      "/books/5",
    );
  });

  it("ISBNが他の本と重複したら、その本へのリンクを出す", async () => {
    vi.mocked(fetchBook).mockResolvedValue(makeBook());
    vi.mocked(updateBook).mockRejectedValue(
      new ApiError(409, [
        {
          type: "already_exists",
          loc: ["body", "isbn"],
          msg: "このISBNの本はすでに登録されています",
          ctx: { book_id: 3 },
        },
      ]),
    );
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: "保存する" }));

    expect(await screen.findByText("このISBNの本はすでに登録されています")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "登録済みの本を見る" })).toHaveAttribute(
      "href",
      "/books/3",
    );
  });

  it("本が存在しなければ「本が見つかりません」と表示する", async () => {
    vi.mocked(fetchBook).mockRejectedValue(
      new ApiError(404, [{ type: "not_found", loc: ["path", "book_id"], msg: "見つかりません" }]),
    );
    renderPage("/books/999/edit");

    expect(await screen.findByRole("heading", { name: "本が見つかりません" })).toBeInTheDocument();
  });

  it("IDが正しくなければ、APIを呼ばずに「本が見つかりません」と表示する", () => {
    renderPage("/books/abc/edit");

    expect(screen.getByRole("heading", { name: "本が見つかりません" })).toBeInTheDocument();
    expect(fetchBook).not.toHaveBeenCalled();
  });
});
