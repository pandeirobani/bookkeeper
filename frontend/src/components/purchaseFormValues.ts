import type { Purchase, PurchaseInput } from "../api/purchases.ts";
import { toIntegerInput } from "../utils/input.ts";

export const PURCHASE_FIELDS = ["purchased_on", "amount", "store", "memo"] as const;

export type PurchaseField = (typeof PURCHASE_FIELDS)[number];

/** 入力欄の値。すべて入力したままの文字列で持つ */
export type PurchaseFormValues = Record<PurchaseField, string>;

/** 新しい購入記録の初期値。購入日は今日にする */
export function newPurchaseFormValues(today: string): PurchaseFormValues {
  return { purchased_on: today, amount: "", store: "", memo: "" };
}

/** 登録済みの購入記録を、編集フォームの初期値にする。NULLは空欄にする */
export function toPurchaseFormValues(purchase: Purchase): PurchaseFormValues {
  return {
    purchased_on: purchase.purchased_on,
    amount: String(purchase.amount),
    store: purchase.store ?? "",
    memo: purchase.memo ?? "",
  };
}

/** 入力欄の値を、APIに送る値にする。金額は整数の入力欄として変換し、検証はサーバーに任せる */
export function toPurchaseInput(values: PurchaseFormValues): PurchaseInput {
  return { ...values, amount: toIntegerInput(values.amount) };
}
