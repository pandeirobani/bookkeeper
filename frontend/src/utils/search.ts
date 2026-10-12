import type { Book } from "../api/books.ts";

/** 比べる前にそろえる。全角と半角（ＡとA、１と1など）、大文字と小文字の違いをなくす */
function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/**
 * 本が検索語に一致するかを返す。
 *
 * 検索語を空白で区切り、すべての語がそれぞれ書名か著者のどちらかに含まれれば一致とする。
 * 例: 「村上 ノルウェイ」は、著者に「村上」、書名に「ノルウェイ」を含む本に一致する。
 * 空白だけの検索語や空の検索語には、すべての本が一致する
 */
export function matchesBookQuery(book: Pick<Book, "title" | "author">, query: string): boolean {
  // 全角の空白も区切りにするため、正規化してから分ける
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const title = normalize(book.title);
  const author = normalize(book.author ?? "");
  return terms.every((term) => title.includes(term) || author.includes(term));
}
