import { z } from "zod";
import { type ApiError, apiRequest, apiRequestWithoutContent } from "./client.ts";

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

/** 書誌情報を置き換える。手放した日と読書記録は変わらない */
export function updateBook(bookId: number, input: BookInput): Promise<Book> {
  return apiRequest(`/books/${bookId}`, bookSchema, { method: "PUT", body: input });
}

/**
 * 手放した日を設定する。null を送ると手元に戻す。
 * disposedOn は日付（YYYY-MM-DD）。空文字はサーバーが日付の形式の誤りとして扱う
 */
export function updateDisposal(bookId: number, disposedOn: string | null): Promise<Book> {
  return apiRequest(`/books/${bookId}/disposal`, bookSchema, {
    method: "PUT",
    body: { disposed_on: disposedOn },
  });
}

/** 書籍を削除する。読書記録と購入記録も一緒に削除される */
export function deleteBook(bookId: number): Promise<void> {
  return apiRequestWithoutContent(`/books/${bookId}`, { method: "DELETE" });
}

/** ISBNの重複（409）のエラーから、登録済みの本のIDを取り出す。重複のエラーでなければ null */
export function findConflictingBookId(error: ApiError): number | null {
  for (const detail of error.details) {
    const bookId = detail.ctx?.book_id;
    if (detail.type === "already_exists" && typeof bookId === "number") {
      return bookId;
    }
  }
  return null;
}
