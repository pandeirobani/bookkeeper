export type HealthResponse = {
  status: "ok";
};

function isHealthResponse(data: unknown): data is HealthResponse {
  return typeof data === "object" && data !== null && "status" in data && data.status === "ok";
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`疎通確認に失敗しました: ${response.status}`);
  }

  const data: unknown = await response.json();
  if (!isHealthResponse(data)) {
    throw new Error("疎通確認のレスポンスが不正です");
  }
  return data;
}
