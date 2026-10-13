import { z } from "zod";
import { apiRequest } from "./client.ts";

// バックエンドの TsundokuResponse（backend/app/schemas.py）と同じ形
const tsundokuSchema = z.object({
  // バックエンドの BookSummaryResponse と同じ形
  book: z.object({
    id: z.number().int(),
    title: z.string(),
    author: z.string().nullable(),
  }),
  /** 積読に入るのは未読と読書中の本だけ */
  status: z.enum(["unread", "reading"]),
  /** 最初の購入日（YYYY-MM-DD）。この日から積んでいるとみなす */
  first_purchased_on: z.iso.date(),
  /** 最初の購入の金額（円） */
  first_purchase_amount: z.number().int(),
  /** その本の購入記録の件数（買い直した本では2件以上） */
  purchase_count: z.number().int(),
});

export type Tsundoku = z.infer<typeof tsundokuSchema>;

/**
 * 積読の本を、長く積んでいる順（最初の購入日の古い順）に取得する。
 *
 * 積読は、読書状態が未読か読書中で、手放しておらず、購入記録が1件以上ある本
 */
export function fetchTsundoku(): Promise<Tsundoku[]> {
  return apiRequest("/tsundoku", z.array(tsundokuSchema));
}
