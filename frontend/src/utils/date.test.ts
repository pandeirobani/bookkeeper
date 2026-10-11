import { describe, expect, it } from "vitest";
import { formatDate } from "./date.ts";

describe("formatDate", () => {
  it("YYYY-MM-DD を YYYY/MM/DD にする", () => {
    expect(formatDate("2026-10-10")).toBe("2026/10/10");
  });
});
