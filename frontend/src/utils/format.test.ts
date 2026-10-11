import { describe, expect, it } from "vitest";
import { formatYen, parseId } from "./format.ts";

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
