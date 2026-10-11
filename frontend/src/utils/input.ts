/**
 * 金額など、整数の入力欄の値をAPIに送る値にする。
 *
 * - 空欄は null
 * - 数字だけ（全角数字も可）なら数値
 * - それ以外は文字列のまま送り、サーバーの「整数で入力してください」を表示する
 */
export function toIntegerInput(value: string): number | string | null {
  const normalized = value.normalize("NFKC").trim();
  if (normalized === "") {
    return null;
  }
  return /^[0-9]+$/.test(normalized) ? Number(normalized) : value;
}
