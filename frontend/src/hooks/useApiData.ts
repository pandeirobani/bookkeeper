import { useCallback, useEffect, useState } from "react";
import { type ApiError, toApiError } from "../api/client.ts";

export type ApiDataState<T> =
  { status: "loading" } | { status: "success"; data: T } | { status: "error"; error: ApiError };

export type ApiData<T> = ApiDataState<T> & {
  /** 取り直す。取り直している間は、前のデータ（またはエラー）を表示したままにする */
  reload: () => void;
};

/**
 * APIからデータを取得し、読み込み中・成功・失敗の状態を返す。
 *
 * load が変わると取り直すので、呼び出し側では useCallback で包むか、
 * モジュールの関数（fetchHealth など）をそのまま渡す。
 * 例: useApiData(useCallback(() => fetchBook(bookId), [bookId]))
 */
export function useApiData<T>(load: () => Promise<T>): ApiData<T> {
  const [state, setState] = useState<ApiDataState<T>>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);

  // 別のデータ（別の本など）を取りに行くときは、前のデータを出さずに読み込み中にする。
  // effect の中で setState するより先に、描画中に切り替える（React の推奨する書き方）
  const [prevLoad, setPrevLoad] = useState(() => load);
  if (load !== prevLoad) {
    setPrevLoad(() => load);
    setState({ status: "loading" });
  }

  useEffect(() => {
    // load が変わった後や、アンマウントした後に届いた古い結果は使わない
    let ignore = false;
    load().then(
      (data) => {
        if (!ignore) setState({ status: "success", data });
      },
      (error: unknown) => {
        if (!ignore) setState({ status: "error", error: toApiError(error) });
      },
    );
    return () => {
      ignore = true;
    };
  }, [load, reloadCount]);

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  return { ...state, reload };
}
