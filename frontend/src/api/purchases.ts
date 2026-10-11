import { z } from "zod";
import { apiRequest, apiRequestWithoutContent } from "./client.ts";

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

/** 購入記録の追加・更新で送る値。入力欄の値をそのまま送り、検証はサーバーに任せる */
export type PurchaseInput = {
  /** 日付（YYYY-MM-DD）。空欄は空文字のまま送り、サーバーの「日付の形式」のエラーを出す */
  purchased_on: string;
  /** 数字だけなら数値、空欄なら null。それ以外は文字列のまま送り、サーバーのエラーを出す */
  amount: number | string | null;
  /** 空文字はサーバーがNULLにする */
  store: string;
  memo: string;
};

/** 本の購入記録を、購入日の新しい順に取得する */
export function fetchPurchases(bookId: number): Promise<Purchase[]> {
  return apiRequest(`/books/${bookId}/purchases`, z.array(purchaseSchema));
}

/**
 * 本に購入記録を追加する。
 * 手放した本で、購入日が手放した日より後なら、サーバーが本を手元に戻す
 */
export function createPurchase(bookId: number, input: PurchaseInput): Promise<Purchase> {
  return apiRequest(`/books/${bookId}/purchases`, purchaseSchema, {
    method: "POST",
    body: input,
  });
}

/** 購入記録を置き換える。手放した日は変わらない */
export function updatePurchase(purchaseId: number, input: PurchaseInput): Promise<Purchase> {
  return apiRequest(`/purchases/${purchaseId}`, purchaseSchema, { method: "PUT", body: input });
}

export function deletePurchase(purchaseId: number): Promise<void> {
  return apiRequestWithoutContent(`/purchases/${purchaseId}`, { method: "DELETE" });
}
