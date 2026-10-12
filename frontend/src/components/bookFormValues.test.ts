import { describe, expect, it } from "vitest";
import { makeBook } from "../test/fixtures.ts";
import type { IsbnLookupResult } from "../api/isbnLookup.ts";
import {
  applyIsbnLookupResult,
  EMPTY_BOOK_FORM_VALUES,
  toBookFormValues,
  toBookInput,
} from "./bookFormValues.ts";

describe("toBookInput", () => {
  it("文字列の項目は入力したまま送る", () => {
    const values = { ...EMPTY_BOOK_FORM_VALUES, title: " テスト書籍 ", isbn: "978-4-00-310101-8" };

    expect(toBookInput(values)).toEqual({ ...values, list_price: null });
  });

  // 変換の細かい場合分けは utils/input.test.ts で確かめる
  it.each([
    ["１９８０", 1980],
    ["", null],
    ["千円", "千円"],
  ])("定価 %j は整数の入力欄として変換し、%j として送る", (listPrice, expected) => {
    const values = { ...EMPTY_BOOK_FORM_VALUES, list_price: listPrice };

    expect(toBookInput(values).list_price).toBe(expected);
  });
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

describe("applyIsbnLookupResult", () => {
  const RESULT: IsbnLookupResult = {
    isbn: "9784480683212",
    title: "９９％の人が速くなる走り方",
    author: "平岩時雄",
    publisher: "筑摩書房",
    published_date: "2018-05-08",
    list_price: 924,
    cover_image_url: "https://cover.openbd.jp/9784480683212.jpg",
  };

  it("取得できた項目を入力欄の値にする。定価は文字列にする", () => {
    const values = { ...EMPTY_BOOK_FORM_VALUES, isbn: "4-480-68321-6" };

    expect(applyIsbnLookupResult(values, RESULT)).toEqual({
      title: "９９％の人が速くなる走り方",
      isbn: "9784480683212",
      author: "平岩時雄",
      publisher: "筑摩書房",
      published_date: "2018-05-08",
      list_price: "924",
      cover_image_url: "https://cover.openbd.jp/9784480683212.jpg",
    });
  });

  it("取得できた項目は、入力済みの値を上書きする", () => {
    const values = toBookFormValues(makeBook());

    expect(applyIsbnLookupResult(values, RESULT)).toMatchObject({
      title: "９９％の人が速くなる走り方",
      list_price: "924",
    });
  });

  it("取得できなかった（null の）項目は、入力済みの値を残す", () => {
    const values = toBookFormValues(makeBook());
    const partial: IsbnLookupResult = {
      ...RESULT,
      title: null,
      author: null,
      publisher: null,
      published_date: null,
      list_price: null,
      cover_image_url: null,
    };

    expect(applyIsbnLookupResult(values, partial)).toEqual({
      ...values,
      isbn: "9784480683212",
    });
  });
});
