import type { ApiError } from "./client.ts";

export type FieldErrors<K extends string> = {
  /** 入力欄ごとのメッセージ。エラーのない項目は含まない */
  fields: Partial<Record<K, string[]>>;
  /** どの入力欄にも結びつかないメッセージ。フォームの上にまとめて出す */
  general: string[];
};

/**
 * APIのエラーを、フォームの入力欄ごとのメッセージと、それ以外のメッセージに分ける。
 *
 * loc が ["body", <項目名>] で、項目名がフォームにあるものだけを入力欄に出す。
 * フォームにない項目のエラーも、表示されずに消えないよう general に回す
 */
export function splitFieldErrors<K extends string>(
  error: ApiError,
  fieldNames: readonly K[],
): FieldErrors<K> {
  const result: FieldErrors<K> = { fields: {}, general: [] };
  for (const detail of error.details) {
    const [location, name] = detail.loc;
    const field = fieldNames.find((fieldName) => fieldName === name);
    if (location === "body" && detail.loc.length === 2 && field !== undefined) {
      result.fields[field] = [...(result.fields[field] ?? []), detail.msg];
    } else {
      result.general.push(detail.msg);
    }
  }
  return result;
}
