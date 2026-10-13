/** 円の金額を「1,980円」の形にする */
export function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円`;
}

/**
 * URLの本のID（/books/:bookId）を数値にする。正の整数でなければ null。
 *
 * "1.5" や "01"、桁が多すぎて正確に表せない値は、存在しない本として扱う
 */
export function parseId(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * URLの年（/expenses?year=…）を数値にする。1〜9999 の整数でなければ null。
 *
 * 範囲はバックエンドの集計APIが受け付ける年に合わせる
 */
export function parseYear(value: string | null): number | null {
  if (value === null || !/^[1-9][0-9]{0,3}$/.test(value)) {
    return null;
  }
  return Number(value);
}
