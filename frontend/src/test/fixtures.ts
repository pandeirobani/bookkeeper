import type { Book } from "../api/books.ts";

/** テスト用の書籍。全項目に値が入っている。必要な項目だけ上書きして使う */
export function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 1,
    isbn: "9784003101018",
    title: "テスト書籍",
    author: "著者A,著者B",
    publisher: "テスト出版",
    published_date: "2024-05",
    list_price: 1980,
    cover_image_url: "https://example.com/cover.jpg",
    disposed_on: null,
    created_at: "2026-10-12T03:00:00Z",
    ...overrides,
  };
}
