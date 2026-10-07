import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App.tsx";

vi.mock("./api/health.ts", () => ({
  fetchHealth: vi.fn().mockResolvedValue({ status: "ok" }),
}));

describe("App", () => {
  it("アプリ名の見出しを表示する", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "BookKeeper" })).toBeInTheDocument();
  });

  it("バックエンドとの疎通状態を表示する", async () => {
    render(<App />);

    expect(await screen.findByText("バックエンド：接続OK")).toBeInTheDocument();
  });
});
