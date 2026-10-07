import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth } from "./health.ts";

describe("fetchHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/health を呼び、レスポンスを返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHealth()).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith("/api/health");
  });

  it("ステータスが 2xx 以外なら例外を投げる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(fetchHealth()).rejects.toThrow("500");
  });

  it("レスポンスの形式が不正なら例外を投げる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "ng" })));

    await expect(fetchHealth()).rejects.toThrow("不正");
  });
});
