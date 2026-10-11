import { describe, expect, it } from "vitest";
import { EMPTY_BOOK_FORM_VALUES, toBookInput } from "./bookFormValues.ts";

describe("toBookInput", () => {
  it("文字列の項目は入力したまま送る", () => {
    const values = { ...EMPTY_BOOK_FORM_VALUES, title: " テスト書籍 ", isbn: "978-4-00-310101-8" };

    expect(toBookInput(values)).toEqual({ ...values, list_price: null });
  });

  it.each([
    ["", null],
    ["  ", null],
    ["1980", 1980],
    ["１９８０", 1980], // 全角数字
    [" 1980 ", 1980],
    ["0", 0],
  ])("定価 %j は %j として送る", (listPrice, expected) => {
    const values = { ...EMPTY_BOOK_FORM_VALUES, list_price: listPrice };

    expect(toBookInput(values).list_price).toBe(expected);
  });

  it.each(["千円", "1,980", "19.8", "-1"])(
    "定価 %j は数字だけではないので、サーバーのエラーを出すため文字列のまま送る",
    (listPrice) => {
      const values = { ...EMPTY_BOOK_FORM_VALUES, list_price: listPrice };

      expect(toBookInput(values).list_price).toBe(listPrice);
    },
  );
});
