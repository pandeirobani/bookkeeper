import { z } from "zod";
import { apiRequest } from "./client.ts";

// バックエンドの IsbnLookupResponse（backend/app/schemas.py）と同じ形
const isbnLookupResultSchema = z.object({
  /** ISBN-13にそろえた値 */
  isbn: z.string(),
  // 以下は取得できなかった項目が null になる
  title: z.string().nullable(),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  published_date: z.string().nullable(),
  list_price: z.number().int().nullable(),
  cover_image_url: z.string().nullable(),
});

export type IsbnLookupResult = z.infer<typeof isbnLookupResultSchema>;

/**
 * ISBNから書誌情報を取得する。取得元は openBD で、DBには保存しない。
 * 入力欄の値をそのまま送り、検証（空欄・ISBNの誤り）はサーバーに任せる
 */
export function lookupIsbn(isbn: string): Promise<IsbnLookupResult> {
  const query = new URLSearchParams({ isbn });
  return apiRequest(`/isbn-lookup?${query}`, isbnLookupResultSchema);
}
