import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client.ts";
import { type BookInput, createBook, fetchBooks } from "./books.ts";

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/books を呼び、書籍の配列を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([BOOK]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBooks()).resolves.toEqual([BOOK]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("手放した日が入った書籍も受け付ける", async () => {
    const disposed = { ...BOOK, disposed_on: "2026-10-10" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([disposed])));

    await expect(fetchBooks()).resolves.toEqual([disposed]);
  });

  it("created_at がUTC（末尾 Z）でなければ応答の形の誤りにする", async () => {
    const naive = { ...BOOK, created_at: "2026-10-12T03:00:00" };
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
