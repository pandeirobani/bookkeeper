/**
 * 日付だけの値（YYYY-MM-DD）を画面用の YYYY/MM/DD にする。
 *
 * Date に変換するとタイムゾーンの影響で日付がずれることがあるので、文字列のまま扱う
 */
export function formatDate(value: string): string {
  return value.replaceAll("-", "/");
}

/**
 * UTCの日時（created_at など）を、表示する環境のタイムゾーンでの日付 YYYY/MM/DD にする。
 *
 * timeZone はテストで固定するためのもので、画面では省略してブラウザのタイムゾーンを使う
 */
export function formatLocalDate(utcDateTime: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date(utcDateTime));
}
