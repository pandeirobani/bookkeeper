import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client.ts";
import { fetchHealth } from "./health.ts";

describe("fetchHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("/api/health を呼び、レスポンスを返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHealth()).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.anything());
  });

  it("レスポンスの形式が不正なら ApiError を投げる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "ng" })));

    await expect(fetchHealth()).rejects.toBeInstanceOf(ApiError);
  });
});
