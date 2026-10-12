import { useEffect, useState } from "react";
import { type NavigateOptions, useLocation, useNavigate } from "react-router";

/**
 * 画面を移るときに、移った先で表示するメッセージ（「〜を登録しました」など）を渡す。
 * 例: navigate("/", withFlashMessage("「書名」を登録しました"))
 */
export function withFlashMessage(message: string): NavigateOptions {
  return { state: { message } };
}

function readMessage(state: unknown): string | null {
  if (typeof state === "object" && state !== null && "message" in state) {
    return typeof state.message === "string" ? state.message : null;
  }
  return null;
}

/** 前の画面から withFlashMessage で渡されたメッセージを返す。なければ null */
export function useFlashMessage(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [message] = useState(() => readMessage(location.state));

  // 表示したメッセージは履歴から消し、再読み込みや「戻る」でもう一度出ないようにする。
  // 一覧画面の検索語（?q=）などは消さずに残す
  // 履歴にメッセージが残っている間だけ書き換え、検索語の入力などで何度も書き換えないようにする
  const hasMessageInHistory = readMessage(location.state) !== null;
  useEffect(() => {
    if (hasMessageInHistory) {
      navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true, state: null },
      );
    }
  }, [hasMessageInHistory, navigate, location.pathname, location.search]);

  return message;
}
