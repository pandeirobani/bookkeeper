import { z } from "zod";
import { apiRequest } from "./client.ts";

export const READING_STATUSES = ["unread", "reading", "finished"] as const;

export type ReadingStatus = (typeof READING_STATUSES)[number];

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  unread: "未読",
  reading: "読書中",
  finished: "読了",
};

// バックエンドの ReadingRecordResponse（backend/app/schemas.py）と同じ形
const readingRecordSchema = z.object({
  id: z.number().int(),
  book_id: z.number().int(),
  status: z.enum(READING_STATUSES),
  started_at: z.iso.date().nullable(),
  finished_at: z.iso.date().nullable(),
  memo: z.string().nullable(),
});

export type ReadingRecord = z.infer<typeof readingRecordSchema>;

/** 読書記録の更新で送る値。送らなかった項目はNULLになるので、すべて送る */
export type ReadingRecordInput = {
  status: ReadingStatus;
  /** 日付（YYYY-MM-DD）。空欄は null */
  started_at: string | null;
  finished_at: string | null;
  /** 空文字はサーバーがNULLにする */
  memo: string;
};

export function fetchReadingRecord(bookId: number): Promise<ReadingRecord> {
  return apiRequest(`/books/${bookId}/reading-record`, readingRecordSchema);
}

export function updateReadingRecord(
  bookId: number,
  input: ReadingRecordInput,
): Promise<ReadingRecord> {
  return apiRequest(`/books/${bookId}/reading-record`, readingRecordSchema, {
    method: "PUT",
    body: input,
  });
}
