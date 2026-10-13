/**
 * 日付だけの値（YYYY-MM-DD）を画面用の YYYY/MM/DD にする。
 *
 * Date に変換するとタイムゾーンの影響で日付がずれることがあるので、文字列のまま扱う
 */
export function formatDate(value: string): string {
  return value.replaceAll("-", "/");
}

/**
 * 表示する環境のタイムゾーンでの今日の日付を YYYY-MM-DD で返す。
 *
 * toISOString() はUTCの日付になり、日本時間の朝9時までは前日になるので使わない
 */
export function todayLocal(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 日付だけの値（YYYY-MM-DD）を、UTCのその日の0時のミリ秒にする */
function toUtcMidnight(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * 日付だけの値（YYYY-MM-DD）の from から to までの日数を返す。to が前なら負の数。
 *
 * どちらもUTCの0時として計算するので、タイムゾーンや夏時間で1日ずれることはない。
 * 例: 積読の本を積んでいる日数 daysBetween(購入日, todayLocal())
 */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / MS_PER_DAY);
}
