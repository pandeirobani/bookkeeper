import { z } from "zod";
import { apiRequest } from "./client.ts";

// バックエンドの BookResponse（backend/app/schemas.py）と同じ形
const bookSchema = z.object({
  id: z.number().int(),
  isbn: z.string().nullable(),
  title: z.string(),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  // API側の形式がまちまちなので、日付としては扱わない
  published_date: z.string().nullable(),
  list_price: z.number().int().nullable(),
  cover_image_url: z.string().nullable(),
  // 日付だけの値（YYYY-MM-DD）。タイムゾーンを持たないので文字列のまま扱う
  disposed_on: z.iso.date().nullable(),
  // UTCの日時（末尾が Z）
  created_at: z.iso.datetime(),
});

export type Book = z.infer<typeof bookSchema>;

/**
 * 書籍の登録・更新で送る値。入力欄の値をそのまま送り、検証はサーバーに任せる。
 * 空文字はサーバーがNULLにする
 */
export type BookInput = {
  title: string;
  isbn: string;
  author: string;
  publisher: string;
  published_date: string;
  /** 数字だけなら数値、空欄なら null。それ以外は文字列のまま送り、サーバーのエラーを出す */
  list_price: number | string | null;
  cover_image_url: string;
};

/** 書籍を新しく登録した順に全件取得する */
export function fetchBooks(): Promise<Book[]> {
  return apiRequest("/books", z.array(bookSchema));
}

export function fetchBook(bookId: number): Promise<Book> {
  return apiRequest(`/books/${bookId}`, bookSchema);
}

export function createBook(input: BookInput): Promise<Book> {
  return apiRequest("/books", bookSchema, { method: "POST", body: input });
}
