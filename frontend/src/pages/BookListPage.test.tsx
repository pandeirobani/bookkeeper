import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type InitialEntry, Link, MemoryRouter, useLocation, useNavigate } from "react-router";
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

/** 一覧画面の外からURLを変える操作。ヘッダーの「本の一覧」のリンクと、ブラウザの「戻る」の代わり */
function OutsideNavigation() {
  const navigate = useNavigate();
  return (
    <>
      <Link to="/">ヘッダーの本の一覧</Link>
      <button type="button" onClick={() => void navigate(-1)}>
        ブラウザの戻る
      </button>
    </>
  );
}

function renderPage(initialEntry: InitialEntry = "/") {
  return renderPageWithHistory([initialEntry]);
}

/** 履歴を指定して表示する。最後の履歴を開いた状態にする */
function renderPageWithHistory(initialEntries: InitialEntry[]) {
  render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
      <BookListPage />
      <LocationSearch />
      <OutsideNavigation />
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
        reading_status: "reading",
      },
    ]);
    renderPage();

    expect(await screen.findByText("全2冊")).toBeInTheDocument();
    expect(bodyRows()).toEqual([
      ["テスト書籍", "著者A,著者B", "テスト出版", "2024-05", "未読", ""],
      ["書名だけの本", "", "", "", "読書中", ""],
    ]);
  });

  it("読書記録のない本は、状態を空欄にする", async () => {
    vi.mocked(fetchBooks).mockResolvedValue([{ ...BOOK, reading_status: null }]);
    renderPage();

    await screen.findByText("全1冊");
    expect(bodyRows()[0][4]).toBe("");
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
    expect(bodyRows()[0][5]).toBe("2026/10/10");
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

      expect(screen.getByText("条件に一致する本はありません")).toBeInTheDocument();
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

  describe("読書状態の絞り込み", () => {
    const BOOKS: BookListItem[] = [
      { ...BOOK, id: 1, title: "未読の本", author: "村上春樹", reading_status: "unread" },
      { ...BOOK, id: 2, title: "読書中の本", author: "村上春樹", reading_status: "reading" },
      { ...BOOK, id: 3, title: "読了の本", author: "夏目漱石", reading_status: "finished" },
      { ...BOOK, id: 4, title: "読書記録のない本", author: null, reading_status: null },
    ];

    function statusGroup(): HTMLElement {
      return screen.getByRole("group", { name: "読書状態" });
    }

    it("未読・読書中・読了のチェックボックスを、最初は何も選ばずに表示する", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      renderPage();

      await screen.findByText("全4冊");
      const checkboxes = within(statusGroup()).getAllByRole("checkbox");
      expect(checkboxes.map((checkbox) => checkbox.parentElement?.textContent)).toEqual([
        "未読",
        "読書中",
        "読了",
      ]);
      for (const checkbox of checkboxes) {
        expect(checkbox).not.toBeChecked();
      }
      expect(bodyTitles()).toHaveLength(4);
    });

    it("選んだ読書状態の本だけを表示し、件数を示す", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage();

      await user.click(await screen.findByRole("checkbox", { name: "読了" }));

      expect(bodyTitles()).toEqual(["読了の本"]);
      expect(screen.getByText("全4冊中1冊")).toBeInTheDocument();
    });

    it("複数選ぶと、そのどれかに当てはまる本を表示する", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage();

      await user.click(await screen.findByRole("checkbox", { name: "未読" }));
      await user.click(screen.getByRole("checkbox", { name: "読書中" }));

      expect(bodyTitles()).toEqual(["未読の本", "読書中の本"]);
      expect(screen.getByText("全4冊中2冊")).toBeInTheDocument();
    });

    it("選択をすべて外すと、読書記録のない本も含めてすべて表示する", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage();

      await user.click(await screen.findByRole("checkbox", { name: "未読" }));
      await user.click(screen.getByRole("checkbox", { name: "未読" }));

      expect(bodyTitles()).toHaveLength(4);
      expect(screen.getByText("全4冊")).toBeInTheDocument();
    });

    it("書名・著者の検索と組み合わせると、両方に当てはまる本を表示する", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage();

      await user.type(await screen.findByRole("searchbox"), "村上");
      await user.click(screen.getByRole("checkbox", { name: "読書中" }));

      expect(bodyTitles()).toEqual(["読書中の本"]);
      expect(screen.getByText("全4冊中1冊")).toBeInTheDocument();
    });

    it("当てはまる本がなければ、そのことを表示する", async () => {
      vi.mocked(fetchBooks).mockResolvedValue([BOOKS[0]]);
      const user = renderPage();

      await user.click(await screen.findByRole("checkbox", { name: "読了" }));

      expect(screen.getByText("条件に一致する本はありません")).toBeInTheDocument();
      expect(screen.getByText("全1冊中0冊")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("選んだ読書状態を、未読・読書中・読了の順でURLに入れ、外したらURLからも外す", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage();

      await user.click(await screen.findByRole("checkbox", { name: "読了" }));
      await user.click(screen.getByRole("checkbox", { name: "未読" }));
      expect(screen.getByTestId("location-search")).toHaveTextContent(
        "?status=unread&status=finished",
      );

      await user.click(screen.getByRole("checkbox", { name: "読了" }));
      await user.click(screen.getByRole("checkbox", { name: "未読" }));
      expect(screen.getByTestId("location-search")).toBeEmptyDOMElement();
    });

    it("検索語と読書状態を、両方ともURLに入れる", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage();

      await user.type(await screen.findByRole("searchbox"), "村上");
      await user.click(screen.getByRole("checkbox", { name: "未読" }));

      expect(screen.getByTestId("location-search")).toHaveTextContent(
        `?q=${encodeURIComponent("村上")}&status=unread`,
      );
    });

    it("URLに読書状態があれば、チェックを入れて絞り込んだ状態で表示する", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      renderPage("/?status=reading&status=finished");

      expect(await screen.findByText("全4冊中2冊")).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "未読" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "読書中" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "読了" })).toBeChecked();
      expect(bodyTitles()).toEqual(["読書中の本", "読了の本"]);
    });

    it("URLの知らない読書状態は無視する", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      renderPage("/?status=tsundoku");

      expect(await screen.findByText("全4冊")).toBeInTheDocument();
      expect(bodyTitles()).toHaveLength(4);
    });
  });

  describe("URLが一覧画面の外から変わったとき", () => {
    const BOOKS: BookListItem[] = [
      { ...BOOK, id: 1, title: "ノルウェイの森", author: "村上春樹", reading_status: "unread" },
      { ...BOOK, id: 2, title: "海辺のカフカ", author: "村上春樹", reading_status: "reading" },
      { ...BOOK, id: 3, title: "Python入門", author: null, reading_status: "finished" },
    ];

    it("絞り込みのないURLに移ると、検索欄とチェックを空にしてすべて表示する", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage(`/?q=${encodeURIComponent("村上")}&status=reading`);
      await screen.findByText("全3冊中1冊");

      await user.click(screen.getByRole("link", { name: "ヘッダーの本の一覧" }));

      expect(screen.getByTestId("location-search")).toBeEmptyDOMElement();
      expect(screen.getByRole("searchbox")).toHaveValue("");
      expect(screen.getByRole("checkbox", { name: "読書中" })).not.toBeChecked();
      expect(bodyTitles()).toHaveLength(3);
      expect(screen.getByText("全3冊")).toBeInTheDocument();
    });

    it("「戻る」で絞り込んでいたURLに戻ると、その検索語と読書状態で絞り込む", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPageWithHistory(["/?q=python&status=finished", "/"]);
      await screen.findByText("全3冊");

      await user.click(screen.getByRole("button", { name: "ブラウザの戻る" }));

      expect(screen.getByRole("searchbox")).toHaveValue("python");
      expect(screen.getByRole("checkbox", { name: "読了" })).toBeChecked();
      expect(bodyTitles()).toEqual(["Python入門"]);
      expect(screen.getByText("全3冊中1冊")).toBeInTheDocument();
    });

    it("一覧画面の中での入力は、URLから読み直さずに入力した値のままにする", async () => {
      vi.mocked(fetchBooks).mockResolvedValue(BOOKS);
      const user = renderPage("/?q=python");
      await screen.findByText("全3冊中1冊");

      await user.clear(screen.getByRole("searchbox"));
      await user.type(screen.getByRole("searchbox"), "村上");
      await user.click(screen.getByRole("checkbox", { name: "未読" }));

      expect(screen.getByRole("searchbox")).toHaveValue("村上");
      expect(screen.getByRole("checkbox", { name: "未読" })).toBeChecked();
      expect(bodyTitles()).toEqual(["ノルウェイの森"]);
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
