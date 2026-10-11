import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBook } from "../api/books.ts";
import { ApiError } from "../api/client.ts";
import { makeBook } from "../test/fixtures.ts";
import BookDetailPage from "./BookDetailPage.tsx";

vi.mock("../api/books.ts", () => ({
  fetchBook: vi.fn(),
}));

function renderPage(path = "/books/1") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/books/:bookId" element={<BookDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 書誌情報の一覧（dl）を {項目名: 値} にする */
function infoItems(): Record<string, string> {
  const list = screen.getByRole("heading", { level: 2 }).parentElement!.querySelector("dl")!;
  const terms = within(list).getAllByRole("term");
  return Object.fromEntries(
    terms.map((term) => [term.textContent, term.nextElementSibling?.textContent ?? ""]),
  );
}

describe("BookDetailPage", () => {
  afterEach(() => {
    vi.mocked(fetchBook).mockReset();
  });

  it("URLのIDの本を取得し、書誌情報を表示する", async () => {
    vi.mocked(fetchBook).mockResolvedValue(makeBook({ id: 12 }));
    renderPage("/books/12");

    expect(
      await screen.findByRole("heading", { level: 2, name: "テスト書籍" }),
    ).toBeInTheDocument();
    expect(fetchBook).toHaveBeenCalledWith(12);
    expect(infoItems()).toEqual({
      著者: "著者A,著者B",
      出版社: "テスト出版",
      出版日: "2024-05",
      ISBN: "9784003101018",
      定価: "1,980円",
      登録日: expect.stringMatching(/^2026\/10\/1[12]$/), // 表示する環境のタイムゾーンによる
    });
    expect(screen.getByRole("img", { name: "表紙" })).toBeInTheDocument();
  });

  it("値のない項目は「—」と表示する", async () => {
    vi.mocked(fetchBook).mockResolvedValue(
      makeBook({
        isbn: null,
        author: null,
        publisher: null,
        published_date: null,
        list_price: null,
        cover_image_url: null,
      }),
    );
    renderPage();

    await screen.findByRole("heading", { level: 2, name: "テスト書籍" });
    expect(infoItems()).toMatchObject({
      著者: "—",
      出版社: "—",
      出版日: "—",
      ISBN: "—",
      定価: "—",
    });
    expect(screen.getByRole("img", { name: "表紙の画像なし" })).toBeInTheDocument();
  });

  it("本が存在しなければ「本が見つかりません」と表示する", async () => {
    vi.mocked(fetchBook).mockRejectedValue(
      new ApiError(404, [
        { type: "not_found", loc: ["path", "book_id"], msg: "ID 999 の本は見つかりません" },
      ]),
    );
    renderPage("/books/999");

    expect(await screen.findByRole("heading", { name: "本が見つかりません" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "本の一覧に戻る" })).toHaveAttribute("href", "/");
  });

  it.each(["/books/abc", "/books/0", "/books/1.5"])(
    "%s のようにIDが正しくなければ、APIを呼ばずに「本が見つかりません」と表示する",
    (path) => {
      renderPage(path);

      expect(screen.getByRole("heading", { name: "本が見つかりません" })).toBeInTheDocument();
      expect(fetchBook).not.toHaveBeenCalled();
    },
  );

  it("404 以外の失敗はエラーを表示する", async () => {
    vi.mocked(fetchBook).mockRejectedValue(
      new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    );
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
  });

  it("前の画面からのメッセージを表示する", async () => {
    vi.mocked(fetchBook).mockResolvedValue(makeBook());
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/books/1", state: { message: "「テスト書籍」を登録しました" } },
        ]}
      >
        <Routes>
          <Route path="/books/:bookId" element={<BookDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("「テスト書籍」を登録しました");
  });
});
