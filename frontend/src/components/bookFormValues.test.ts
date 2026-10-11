import { describe, expect, it } from "vitest";
import { makeBook } from "../test/fixtures.ts";
import { EMPTY_BOOK_FORM_VALUES, toBookFormValues, toBookInput } from "./bookFormValues.ts";

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

describe("toBookFormValues", () => {
  it("登録済みの本の値を入力欄の値にし、NULLは空欄にする", () => {
    const book = makeBook({ author: null, cover_image_url: null });

    expect(toBookFormValues(book)).toEqual({
      title: "テスト書籍",
      isbn: "9784003101018",
      author: "",
      publisher: "テスト出版",
      published_date: "2024-05",
      list_price: "1980",
      cover_image_url: "",
    });
  });

  it("定価がなければ空欄にする", () => {
    expect(toBookFormValues(makeBook({ list_price: null })).list_price).toBe("");
  });
});
