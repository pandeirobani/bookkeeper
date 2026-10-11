import { describe, expect, it } from "vitest";
import { toIntegerInput } from "./input.ts";

describe("toIntegerInput", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["1980", 1980],
    ["１９８０", 1980], // 全角数字
    [" 1980 ", 1980],
    ["0", 0],
  ])("%j は %j として送る", (value, expected) => {
    expect(toIntegerInput(value)).toBe(expected);
  });

  it.each(["千円", "1,980", "19.8", "-1"])(
    "%j は数字だけではないので、サーバーのエラーを出すため文字列のまま送る",
    (value) => {
      expect(toIntegerInput(value)).toBe(value);
    },
  );
});
