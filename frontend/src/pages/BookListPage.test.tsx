import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type InitialEntry, MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BookListItem, fetchBooks } from "../api/books.ts";
import { ApiError } from "../api/client.ts";
import BookListPage from "./BookListPage.tsx";

vi.mock("../api/books.ts", () => ({
  fetchBooks: vi.fn(),
}));

const BOOK: BookListItem = {
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
  reading_status: "unread",
};

/** 今のURLのクエリ文字列を表示する。検索語がURLに入ったかを確かめるため */
function LocationSearch() {
  return <p data-testid="location-search">{useLocation().search}</p>;
}

function renderPage(initialEntry: InitialEntry = "/") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <BookListPage />
      <LocationSearch />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

/** 表の本文の行の書名 */
function bodyTitles(): string[] {
  return bodyRows().map(([title]) => title);
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

  it("書名から本の詳細画面に移れる", async () => {
    vi.mocked(fetchBooks).mockResolvedValue([{ ...BOOK, id: 12 }]);
    renderPage();

    expect(await screen.findByRole("link", { name: "テスト書籍" })).toHaveAttribute(
      "href",
      "/books/12",
    );
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

  describe("検索", () => {
    const BOOKS: BookListItem[] = [
      { ...BOOK, id: 1, title: "ノルウェイの森", author: "村上春樹" },
      { ...BOOK, id: 2, title: "海辺のカフカ", author: "村上春樹" },
      { ...BOOK, id: 3, title: "Python入門", author: null },
    ];

    it("書名か著者に検索語を含む本だけを表示し、件数を示す", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage();

      await user.type(await screen.findByRole("searchbox", { name: "書名・著者で検索" }), "カフカ");

      expect(bodyTitles()).toEqual(["海辺のカフカ"]);
      expect(screen.getByText("全3冊中1冊")).toBeInTheDocument();

      await user.clear(screen.getByRole("searchbox"));
      await user.type(screen.getByRole("searchbox"), "村上");

      expect(bodyTitles()).toEqual(["ノルウェイの森", "海辺のカフカ"]);
      expect(screen.getByText("全3冊中2冊")).toBeInTheDocument();
    });

    it("入力した文字は、URLの更新を待たずにすぐ検索欄に反映する", async () => {
      // 入力の直後に値が一瞬でも元に戻ると、日本語入力（IME）の変換中の文字が二重になる（「あ」が「ああ」になる）
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      renderPage();
      const searchbox = await screen.findByRole<HTMLInputElement>("searchbox");

      // act で包むと後回しの更新まで済んでしまうため、ブラウザと同じく直接イベントを送る
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(searchbox, "あ");
      searchbox.dispatchEvent(new Event("input", { bubbles: true }));

      expect(searchbox.value).toBe("あ");
      await screen.findByText("全3冊中0冊");
    });

    it("空白で区切った語をすべて含む本を表示する", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage();

      await user.type(await screen.findByRole("searchbox"), "村上 森");

      expect(bodyTitles()).toEqual(["ノルウェイの森"]);
    });

    it("検索語をURLに入れ、消したらURLからも外す", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage();

      await user.type(await screen.findByRole("searchbox"), "村上");
      expect(screen.getByTestId("location-search")).toHaveTextContent(
        `?q=${encodeURIComponent("村上")}`,
      );

      await user.clear(screen.getByRole("searchbox"));
      expect(screen.getByTestId("location-search")).toBeEmptyDOMElement();
      expect(bodyTitles()).toHaveLength(3);
      expect(screen.getByText("全3冊")).toBeInTheDocument();
    });

    it("URLに検索語があれば、絞り込んだ状態で表示する", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      renderPage(`/?q=${encodeURIComponent("python")}`);

      expect(await screen.findByText("全3冊中1冊")).toBeInTheDocument();
      expect(screen.getByRole("searchbox")).toHaveValue("python");
      expect(bodyTitles()).toEqual(["Python入門"]);
    });

    it("前の画面からのメッセージを表示しても、URLの検索語は残す", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      renderPage({ pathname: "/", search: "?q=python", state: { message: "削除しました" } });

      expect(await screen.findByRole("status")).toHaveTextContent("削除しました");
      expect(screen.getByTestId("location-search")).toHaveTextContent("?q=python");
      expect(bodyTitles()).toEqual(["Python入門"]);
    });

    it("一致する本がなければ、そのことを表示する", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage();

      await user.type(await screen.findByRole("searchbox"), " 海辺 ノルウェイ ");

      expect(screen.getByText("「海辺 ノルウェイ」に一致する本はありません")).toBeInTheDocument();
      expect(screen.getByText("全3冊中0冊")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("空白だけの検索語では絞り込まない", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage();

      await user.type(await screen.findByRole("searchbox"), "  ");

      expect(bodyTitles()).toHaveLength(3);
      expect(screen.getByText("全3冊")).toBeInTheDocument();
    });

    it("本がなければ検索欄を表示しない", async () => {
      vi.mocked(fetchBooks).mockResolvedValue([]);
      renderPage();

      await screen.findByText(/まだ本が登録されていません/);
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    });
  });

  it("取得に失敗したらエラーを表示する", async () => {
    vi.mocked(fetchBooks).mockRejectedValue(
      new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    );
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
  });
});
