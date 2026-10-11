import { z } from "zod";

// バックエンドのエラーは、ステータスコードによらず常に
// {"detail": [{type, loc, msg, ctx?}]} の形で返る（backend/app/errors.py）
const apiErrorDetailSchema = z.object({
  type: z.string(),
  loc: z.array(z.union([z.string(), z.number()])),
  msg: z.string(),
  ctx: z.record(z.string(), z.unknown()).optional(),
});

const apiErrorBodySchema = z.object({
  detail: z.array(apiErrorDetailSchema),
});

export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;

/** API呼び出しの失敗。画面ではどの失敗でも details[].msg を表示すればよい */
export class ApiError extends Error {
  /** HTTPのステータスコード。サーバーに接続できなかった場合は 0 */
  readonly status: number;
  readonly details: ApiErrorDetail[];

  constructor(status: number, details: ApiErrorDetail[]) {
    super(details.map((detail) => detail.msg).join("\n"));
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * catch した値を ApiError にそろえる。
 * API呼び出し以外の失敗（プログラムの誤り）も、画面には同じ形で出す
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  console.error(error);
  return clientError(0, "unknown_error", "予期しないエラーが起きました");
}

/** バックエンドの外で起きた失敗も、バックエンドのエラーと同じ形にする */
function clientError(status: number, type: string, msg: string): ApiError {
  return new ApiError(status, [{ type, loc: [], msg }]);
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** JSONにして送る値 */
  body?: unknown;
};

async function send(path: string, { method = "GET", body }: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    // fetch はネットワークの失敗のときだけ例外を投げる
    throw clientError(0, "network_error", "サーバーに接続できません");
  }

  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  return response;
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  // 500 などでは本文がJSONでないことがある
  const body: unknown = await response.json().catch(() => null);
  const parsed = apiErrorBodySchema.safeParse(body);
  if (parsed.success) {
    return new ApiError(response.status, parsed.data.detail);
  }
  return clientError(response.status, "server_error", "サーバーでエラーが起きました");
}

/** APIを呼び、応答を schema で確かめて返す */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const response = await send(path, options);
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // バックエンドとフロントエンドで応答の形が食い違っている
    throw clientError(
      response.status,
      "invalid_response",
      "サーバーの応答の形式が正しくありません",
    );
  }
  return parsed.data;
}

/** 応答の本文がないAPI（削除の 204 など）を呼ぶ */
export async function apiRequestWithoutContent(
  path: string,
  options: RequestOptions = {},
): Promise<void> {
  await send(path, options);
}
