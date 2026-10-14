import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorMessage from "./ErrorMessage.tsx";

describe("ErrorMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("メッセージを alert として表示する", () => {
    render(<ErrorMessage messages={["サーバーに接続できません"]} />);

    expect(screen.getByRole("alert")).toHaveTextContent("サーバーに接続できません");
  });

  it("複数のメッセージは箇条書きにする", () => {
    render(<ErrorMessage messages={["エラー1", "エラー2"]} />);

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "エラー1",
      "エラー2",
    ]);
  });

  it("同じ文言のメッセージも、それぞれ1行ずつ表示する", () => {
    // key が重なると React が console.error で警告するので、警告が出ないことも確かめる
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorMessage messages={["同じエラー", "同じエラー"]} />);

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "同じエラー",
      "同じエラー",
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("メッセージがなければ何も表示しない", () => {
    render(<ErrorMessage messages={[]} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
