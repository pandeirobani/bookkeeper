import type { BookInput } from "../api/books.ts";

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

/**
 * 定価の入力値を送る値にする。
 *
 * - 空欄は null
 * - 数字だけ（全角数字も可）なら数値
 * - それ以外は文字列のまま送り、サーバーの「整数で入力してください」を表示する
 */
function toListPrice(value: string): number | string | null {
  const normalized = value.normalize("NFKC").trim();
  if (normalized === "") {
    return null;
  }
  return /^[0-9]+$/.test(normalized) ? Number(normalized) : value;
}

/** 入力欄の値を、APIに送る値にする。文字列の項目の検証や空欄の扱いはサーバーに任せる */
export function toBookInput(values: BookFormValues): BookInput {
  return { ...values, list_price: toListPrice(values.list_price) };
}
