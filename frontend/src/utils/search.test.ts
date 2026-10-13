import { describe, expect, it } from "vitest";
import { matchesBookQuery, matchesReadingStatuses, parseReadingStatuses } from "./search.ts";

const BOOK = { title: "ノルウェイの森", author: "村上春樹" };

describe("matchesBookQuery", () => {
  it.each(["ノルウェイ", "森", "ノルウェイの森"])("書名の一部 %j に一致する", (query) => {
    expect(matchesBookQuery(BOOK, query)).toBe(true);
  });

  it.each(["村上", "春樹"])("著者の一部 %j に一致する", (query) => {
    expect(matchesBookQuery(BOOK, query)).toBe(true);
  });

  it("書名にも著者にも含まれなければ一致しない", () => {
    expect(matchesBookQuery(BOOK, "海辺")).toBe(false);
  });

  it("空白で区切った語がすべて含まれれば一致する", () => {
    expect(matchesBookQuery(BOOK, "村上 ノルウェイ")).toBe(true);
  });

  it("空白で区切った語のうち1つでも含まれなければ一致しない", () => {
    expect(matchesBookQuery(BOOK, "村上 海辺")).toBe(false);
  });

  it("全角の空白や連続する空白も区切りにする", () => {
    expect(matchesBookQuery(BOOK, "  村上　　ノルウェイ ")).toBe(true);
  });

  it("書名と著者をまたぐ語には一致しない", () => {
    expect(matchesBookQuery(BOOK, "森村上")).toBe(false);
  });

  it.each([
    ["python", "Python入門"],
    ["PYTHON", "Python入門"],
    ["ＰＹＴＨＯＮ", "Python入門"],
    ["python", "ＰＹＴＨＯＮ入門"],
    ["2", "第２版"],
    ["ｶﾌｶ", "カフカ"],
  ])("全角と半角、大文字と小文字を区別しない（%j で %j）", (query, title) => {
    expect(matchesBookQuery({ title, author: null }, query)).toBe(true);
  });

  it("ひらがなとカタカナは区別する", () => {
    expect(matchesBookQuery(BOOK, "のるうぇい")).toBe(false);
  });

  it("著者がない本は書名だけで判定する", () => {
    const book = { title: "書名だけの本", author: null };
    expect(matchesBookQuery(book, "書名")).toBe(true);
    expect(matchesBookQuery(book, "村上")).toBe(false);
  });

  it.each(["", " ", "　"])("空の検索語 %j にはすべての本が一致する", (query) => {
    expect(matchesBookQuery(BOOK, query)).toBe(true);
  });
});

describe("parseReadingStatuses", () => {
  it("未読・読書中・読了の順にそろえる", () => {
    expect(parseReadingStatuses(["finished", "unread"])).toEqual(["unread", "finished"]);
  });

  it("知らない値は無視し、同じ値は1つにする", () => {
    expect(parseReadingStatuses(["reading", "tsundoku", "", "reading"])).toEqual(["reading"]);
  });

  it("値がなければ空の配列にする", () => {
    expect(parseReadingStatuses([])).toEqual([]);
  });
});

describe("matchesReadingStatuses", () => {
  it("何も選んでいなければ、どの本も当てはまる", () => {
    expect(matchesReadingStatuses("finished", [])).toBe(true);
    expect(matchesReadingStatuses(null, [])).toBe(true);
  });

  it("選んだ読書状態のどれかなら当てはまる", () => {
    expect(matchesReadingStatuses("unread", ["unread", "reading"])).toBe(true);
    expect(matchesReadingStatuses("reading", ["unread", "reading"])).toBe(true);
    expect(matchesReadingStatuses("finished", ["unread", "reading"])).toBe(false);
  });

  it("読書記録のない本は、読書状態を選んでいると当てはまらない", () => {
    expect(matchesReadingStatuses(null, ["unread"])).toBe(false);
  });
});
