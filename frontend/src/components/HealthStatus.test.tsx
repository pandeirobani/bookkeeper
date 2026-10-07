import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth } from "../api/health.ts";
import HealthStatus from "./HealthStatus.tsx";

vi.mock("../api/health.ts", () => ({
  fetchHealth: vi.fn(),
}));

describe("HealthStatus", () => {
  afterEach(() => {
    vi.mocked(fetchHealth).mockReset();
  });

  it("応答を待っている間は確認中と表示する", () => {
    vi.mocked(fetchHealth).mockReturnValue(new Promise(() => {}));
    render(<HealthStatus />);

    expect(screen.getByRole("status")).toHaveTextContent("バックエンド：確認中…");
  });

  it("疎通に成功したら接続OKと表示する", async () => {
    vi.mocked(fetchHealth).mockResolvedValue({ status: "ok" });
    render(<HealthStatus />);

    expect(await screen.findByText("バックエンド：接続OK")).toBeInTheDocument();
  });

  it("疎通に失敗したら接続できませんと表示する", async () => {
    vi.mocked(fetchHealth).mockRejectedValue(new Error("network error"));
    render(<HealthStatus />);

    expect(await screen.findByText("バックエンド：接続できません")).toBeInTheDocument();
  });
});
