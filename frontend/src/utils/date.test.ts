import { describe, expect, it } from "vitest";
import { daysBetween, formatDate, formatLocalDate, todayLocal } from "./date.ts";

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

describe("todayLocal", () => {
  it("表示する環境のタイムゾーンでの日付を YYYY-MM-DD で返す", () => {
    // 年・月・日を指定して作った Date は、その環境のタイムゾーンの日時になる
    expect(todayLocal(new Date(2026, 0, 5, 8, 30))).toBe("2026-01-05");
    expect(todayLocal(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("daysBetween", () => {
  it.each([
    ["2026-10-13", "2026-10-13", 0],
    ["2026-10-12", "2026-10-13", 1],
    ["2026-09-30", "2026-10-01", 1],
    ["2025-12-31", "2026-01-01", 1],
    ["2026-01-01", "2026-12-31", 364],
    ["2025-10-13", "2026-10-13", 365],
    // うるう年の2月29日をまたぐ
    ["2028-02-28", "2028-03-01", 2],
    ["2027-10-13", "2028-10-13", 366],
  ])("%s から %s までは %d 日", (from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected);
  });

  it("to が from より前なら負の数を返す", () => {
    expect(daysBetween("2026-10-13", "2026-10-10")).toBe(-3);
  });
});
