import { useEffect, useState } from "react";
import { fetchHealth } from "../api/health.ts";

type Status = "checking" | "ok" | "error";

const messages: Record<Status, string> = {
  checking: "バックエンド：確認中…",
  ok: "バックエンド：接続OK",
  error: "バックエンド：接続できません",
};

function HealthStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    // アンマウント後に結果が返ってきた場合は state を更新しない
    let ignore = false;
    fetchHealth()
      .then(() => {
        if (!ignore) setStatus("ok");
      })
      .catch(() => {
        if (!ignore) setStatus("error");
      });
    return () => {
      ignore = true;
    };
  }, []);

  return <p role="status">{messages[status]}</p>;
}

export default HealthStatus;
