import type { Book, BookInput } from "../api/books.ts";
import type { IsbnLookupResult } from "../api/isbnLookup.ts";
import { toIntegerInput } from "../utils/input.ts";

export const BOOK_FIELDS = [
  "title",
  "isbn",
  "author",
  "publisher",
  "published_date",
  "list_price",
  "cover_image_url",
] as const;

export type BookField = (typeof BOOK_FIELDS)[number];

/** 入力欄の値。すべて入力したままの文字列で持つ */
export type BookFormValues = Record<BookField, string>;

export const EMPTY_BOOK_FORM_VALUES: BookFormValues = {
  title: "",
  isbn: "",
  author: "",
  publisher: "",
  published_date: "",
  list_price: "",
  cover_image_url: "",
};

/** 登録済みの本の値を、編集フォームの初期値にする。NULLは空欄にする */
export function toBookFormValues(book: Book): BookFormValues {
  return {
    title: book.title,
    isbn: book.isbn ?? "",
    author: book.author ?? "",
    publisher: book.publisher ?? "",
    published_date: book.published_date ?? "",
    list_price: book.list_price === null ? "" : String(book.list_price),
    cover_image_url: book.cover_image_url ?? "",
  };
}

/**
 * ISBNから取得した書誌情報を、入力欄の値に重ねる。
 * 取得できた項目だけを上書きし、取得できなかった（null の）項目は入力済みの値を残す
 * （docs/openbd.md の「編集画面で取得し直すとき」）
 */
export function applyIsbnLookupResult(
  values: BookFormValues,
  result: IsbnLookupResult,
): BookFormValues {
  return {
    // ISBN-13にそろえた値にする
    isbn: result.isbn,
    title: result.title ?? values.title,
    author: result.author ?? values.author,
    publisher: result.publisher ?? values.publisher,
    published_date: result.published_date ?? values.published_date,
    list_price: result.list_price === null ? values.list_price : String(result.list_price),
    cover_image_url: result.cover_image_url ?? values.cover_image_url,
  };
}

/** 入力欄の値を、APIに送る値にする。文字列の項目の検証や空欄の扱いはサーバーに任せる */
export function toBookInput(values: BookFormValues): BookInput {
  return { ...values, list_price: toIntegerInput(values.list_price) };
}
