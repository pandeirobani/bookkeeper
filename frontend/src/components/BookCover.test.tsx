import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BookCover from "./BookCover.tsx";

describe("BookCover", () => {
  it("URLがあれば表紙の画像を表示する", () => {
    render(<BookCover url="https://example.com/cover.jpg" />);

    expect(screen.getByRole("img", { name: "表紙" })).toHaveAttribute(
      "src",
      "https://example.com/cover.jpg",
    );
  });

  it("URLがなければ代わりの枠を表示する", () => {
    render(<BookCover url={null} />);

    expect(screen.getByRole("img", { name: "表紙の画像なし" })).toHaveTextContent("表紙なし");
  });

  it("画像を読み込めなければ代わりの枠を表示する", () => {
    render(<BookCover url="https://example.com/cover.jpg" />);

    fireEvent.error(screen.getByRole("img", { name: "表紙" }));

    expect(screen.getByRole("img", { name: "表紙の画像なし" })).toBeInTheDocument();
  });
});
