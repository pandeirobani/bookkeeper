import { z } from "zod";
import { apiRequest } from "./client.ts";

// バックエンドの PurchaseResponse（backend/app/schemas.py）と同じ形
const purchaseSchema = z.object({
  id: z.number().int(),
  book_id: z.number().int(),
  purchased_on: z.iso.date(),
  amount: z.number().int(),
  store: z.string().nullable(),
  memo: z.string().nullable(),
  created_at: z.iso.datetime(),
});

export type Purchase = z.infer<typeof purchaseSchema>;

/** 本の購入記録を、購入日の新しい順に取得する */
export function fetchPurchases(bookId: number): Promise<Purchase[]> {
  return apiRequest(`/books/${bookId}/purchases`, z.array(purchaseSchema));
}
