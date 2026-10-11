import { fetchHealth } from "../api/health.ts";
import { type ApiDataState, useApiData } from "../hooks/useApiData.ts";

const messages: Record<ApiDataState<unknown>["status"], string> = {
  loading: "バックエンド：確認中…",
  success: "バックエンド：接続OK",
  error: "バックエンド：接続できません",
};

function HealthStatus() {
  const health = useApiData(fetchHealth);

  return <p role="status">{messages[health.status]}</p>;
}

export default HealthStatus;
