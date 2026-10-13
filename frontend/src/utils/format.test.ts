import { describe, expect, it } from "vitest";
import { formatYen, parseId, parseMonth, parseYear } from "./format.ts";

describe("formatYen", () => {
  it.each([
    [0, "0円"],
    [980, "980円"],
    [1980, "1,980円"],
    [10_000_000, "10,000,000円"],
  ])("%d を %s にする", (amount, expected) => {
    expect(formatYen(amount)).toBe(expected);
  });
});

describe("parseId", () => {
  it.each([
    ["1", 1],
    ["123", 123],
  ])("%j を %d にする", (value, expected) => {
    expect(parseId(value)).toBe(expected);
  });

  it.each([undefined, "", "0", "01", "-1", "1.5", "abc", "1a", "99999999999999999999"])(
    "%j は null にする",
    (value) => {
      expect(parseId(value)).toBeNull();
    },
  );
});

describe("parseYear", () => {
  it.each([
    ["1", 1],
    ["2026", 2026],
    ["9999", 9999],
  ])("%j を %d にする", (value, expected) => {
    expect(parseYear(value)).toBe(expected);
  });

  it.each([null, "", "0", "02026", "10000", "-1", "2026.5", "abc", "2026a"])(
    "%j は null にする",
    (value) => {
      expect(parseYear(value)).toBeNull();
    },
  );
});

describe("parseMonth", () => {
  it.each([
    ["1", 1],
    ["9", 9],
    ["12", 12],
  ])("%j を %d にする", (value, expected) => {
    expect(parseMonth(value)).toBe(expected);
  });

  it.each([null, "", "0", "01", "13", "-1", "1.5", "abc", "1a"])("%j は null にする", (value) => {
    expect(parseMonth(value)).toBeNull();
  });
});
