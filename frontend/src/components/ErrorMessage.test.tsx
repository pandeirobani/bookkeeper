import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ErrorMessage from "./ErrorMessage.tsx";

describe("ErrorMessage", () => {
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

  it("メッセージがなければ何も表示しない", () => {
    render(<ErrorMessage messages={[]} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
