import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ReadingRecordInput,
  fetchReadingRecord,
  updateReadingRecord,
} from "./readingRecords.ts";

const RECORD = {
  id: 1,
  book_id: 3,
  status: "finished",
  started_at: "2026-10-01",
  finished_at: "2026-10-10",
  memo: "面白かった",
};

describe("fetchReadingRecord", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/books/{id}/reading-record を呼び、読書記録を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(RECORD));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchReadingRecord(3)).resolves.toEqual(RECORD);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/3/reading-record",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("updateReadingRecord", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("入力値を PUT で送り、更新した読書記録を返す", async () => {
    const input: ReadingRecordInput = {
      status: "reading",
      started_at: "2026-10-01",
      finished_at: null,
      memo: "",
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(RECORD));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateReadingRecord(3, input)).resolves.toEqual(RECORD);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/3/reading-record",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(input) }),
    );
  });
});
