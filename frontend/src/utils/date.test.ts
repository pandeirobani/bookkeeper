import { describe, expect, it } from "vitest";
import { formatDate, formatLocalDate } from "./date.ts";

describe("formatDate", () => {
  it("YYYY-MM-DD を YYYY/MM/DD にする", () => {
    expect(formatDate("2026-10-10")).toBe("2026/10/10");
  });
});

describe("formatLocalDate", () => {
  it("UTCの日時を、指定したタイムゾーンの日付にする", () => {
    // UTC 15:00 は日本時間では翌日の 0:00
    expect(formatLocalDate("2026-10-11T15:00:00Z", "Asia/Tokyo")).toBe("2026/10/12");
    expect(formatLocalDate("2026-10-11T14:59:59Z", "Asia/Tokyo")).toBe("2026/10/11");
  });
});
