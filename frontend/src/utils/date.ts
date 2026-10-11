/**
 * 日付だけの値（YYYY-MM-DD）を画面用の YYYY/MM/DD にする。
 *
 * Date に変換するとタイムゾーンの影響で日付がずれることがあるので、文字列のまま扱う
 */
export function formatDate(value: string): string {
  return value.replaceAll("-", "/");
}
