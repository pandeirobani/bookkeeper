import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client.ts";
import {
  type BookInput,
  createBook,
  deleteBook,
  fetchBook,
  fetchBooks,
  findConflictingBookId,
  updateBook,
  updateDisposal,
} from "./books.ts";

const BOOK = {
  id: 1,
  isbn: "9784003101018",
  title: "テスト書籍",
  author: "著者A",
  publisher: "テスト出版",
  published_date: "2024-05",
  list_price: 1980,
  cover_image_url: "https://example.com/cover.jpg",
  disposed_on: null,
  created_at: "2026-10-12T03:00:00Z",
};

const INPUT: BookInput = {
  title: "テスト書籍",
  isbn: "",
  author: "",
  publisher: "",
  published_date: "",
  list_price: null,
  cover_image_url: "",
};

describe("fetchBooks", () => {
  // 一覧の書籍には、読書状態も付く
  const LIST_ITEM = { ...BOOK, reading_status: "unread" };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/books を呼び、書籍の配列を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([LIST_ITEM]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBooks()).resolves.toEqual([LIST_ITEM]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("手放した日が入った書籍も受け付ける", async () => {
    const disposed = { ...LIST_ITEM, disposed_on: "2026-10-10" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([disposed])));

    await expect(fetchBooks()).resolves.toEqual([disposed]);
  });

  it.each(["unread", "reading", "finished", null])(
    "読書状態が %s の書籍を受け付ける",
    async (status) => {
      const item = { ...LIST_ITEM, reading_status: status };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([item])));

      await expect(fetchBooks()).resolves.toEqual([item]);
    },
  );

  it("読書状態がない、または知らない値なら応答の形の誤りにする", async () => {
    // BOOK は一覧以外の応答の形で、読書状態がない
    const unknown = { ...LIST_ITEM, reading_status: "tsundoku" };

    for (const body of [BOOK, unknown]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([body])));
      await expect(fetchBooks()).rejects.toBeInstanceOf(ApiError);
    }
  });

  it("created_at がUTC（末尾 Z）でなければ応答の形の誤りにする", async () => {
    const naive = { ...LIST_ITEM, created_at: "2026-10-12T03:00:00" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([naive])));

    await expect(fetchBooks()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("createBook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("入力値を POST /api/books に送り、登録した書籍を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(BOOK, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createBook(INPUT)).resolves.toEqual(BOOK);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books",
      expect.objectContaining({ method: "POST", body: JSON.stringify(INPUT) }),
    );
  });
});

describe("fetchBook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/books/{id} を呼び、書籍を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(BOOK));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBook(1)).resolves.toEqual(BOOK);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/1",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("updateBook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("入力値を PUT /api/books/{id} に送り、更新した書籍を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(BOOK));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateBook(1, INPUT)).resolves.toEqual(BOOK);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/1",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(INPUT) }),
    );
  });
});

describe("findConflictingBookId", () => {
  it("ISBNの重複のエラーから、登録済みの本のIDを返す", () => {
    const error = new ApiError(409, [
      {
        type: "already_exists",
        loc: ["body", "isbn"],
        msg: "このISBNの本はすでに登録されています",
        ctx: { book_id: 3 },
      },
    ]);

    expect(findConflictingBookId(error)).toBe(3);
  });

  it("重複のエラーでなければ null を返す", () => {
    const error = new ApiError(422, [
      { type: "value_error", loc: ["body", "isbn"], msg: "ISBNが正しくありません" },
    ]);

    expect(findConflictingBookId(error)).toBeNull();
  });
});

describe("updateDisposal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { disposedOn: "2026-10-10", description: "手放した日を設定する" },
    { disposedOn: null, description: "手元に戻す" },
  ])("$description: $disposedOn を PUT /api/books/{id}/disposal に送る", async ({ disposedOn }) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(BOOK));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateDisposal(1, disposedOn)).resolves.toEqual(BOOK);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/1/disposal",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ disposed_on: disposedOn }),
      }),
    );
  });
});

describe("deleteBook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("DELETE /api/books/{id} を呼ぶ", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteBook(1)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
