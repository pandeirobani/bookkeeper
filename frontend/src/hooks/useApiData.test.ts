import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.ts";
import { useApiData } from "./useApiData.ts";

/** 外から resolve できる Promise。結果が届く順番を制御するために使う */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("useApiData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("読み込み中の後、取得したデータを返す", async () => {
    const load = vi.fn().mockResolvedValue("データ");

    const { result } = renderHook(() => useApiData(load));

    expect(result.current.status).toBe("loading");
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: "success", data: "データ" }),
    );
  });

  it("失敗したら ApiError を返す", async () => {
    const error = new ApiError(404, [{ type: "not_found", loc: [], msg: "見つかりません" }]);
    const load = vi.fn().mockRejectedValue(error);

    const { result } = renderHook(() => useApiData(load));

    await waitFor(() => expect(result.current).toMatchObject({ status: "error", error }));
  });

  it("ApiError 以外の失敗は「予期しないエラー」の ApiError にする", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn().mockRejectedValue(new Error("バグ"));

    const { result } = renderHook(() => useApiData(load));

    await waitFor(() => expect(result.current.status).toBe("error"));
    if (result.current.status !== "error") throw new Error("unreachable");
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error.message).toBe("予期しないエラーが起きました");
  });

  it("reload で取り直し、その間は前のデータを返し続ける", async () => {
    const second = deferred<string>();
    const load = vi.fn().mockResolvedValueOnce("1回目").mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useApiData(load));
    await waitFor(() => expect(result.current).toMatchObject({ data: "1回目" }));

    act(() => result.current.reload());

    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ status: "success", data: "1回目" });

    await act(async () => second.resolve("2回目"));
    expect(result.current).toMatchObject({ status: "success", data: "2回目" });
  });

  it("load が変わったら読み込み中に戻し、古い結果は使わない", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loadFirst = () => first.promise;
    const loadSecond = () => second.promise;

    const { result, rerender } = renderHook(({ load }) => useApiData(load), {
      initialProps: { load: loadFirst },
    });
    rerender({ load: loadSecond });
    expect(result.current.status).toBe("loading");

    // 新しい結果の後に古い結果が届いても、新しい結果のままにする
    await act(async () => second.resolve("本2"));
    await act(async () => first.resolve("本1"));

    expect(result.current).toMatchObject({ status: "success", data: "本2" });
  });
});
