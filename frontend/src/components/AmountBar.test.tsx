import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AmountBar from "./AmountBar.tsx";

/** 棒の部分の要素。棒を出さないときは null */
function renderBar(amount: number, max: number): HTMLElement | null {
  const { container } = render(<AmountBar amount={amount} max={max} />);
  const track = container.firstElementChild;
  return track?.firstElementChild instanceof HTMLElement ? track.firstElementChild : null;
}

describe("AmountBar", () => {
  it("一番大きい金額に対する割合を棒の幅にする", () => {
    expect(renderBar(250, 1000)).toHaveStyle({ width: "25%" });
  });

  it("一番大きい金額の棒は幅いっぱいにする", () => {
    expect(renderBar(1000, 1000)).toHaveStyle({ width: "100%" });
  });

  it("一番大きい金額を超えても、幅いっぱいまでにする", () => {
    expect(renderBar(1500, 1000)).toHaveStyle({ width: "100%" });
  });

  it("0円のときは棒を出さない", () => {
    expect(renderBar(0, 1000)).toBeNull();
  });

  it("一番大きい金額が0円（全部0円）のときは棒を出さない", () => {
    expect(renderBar(0, 0)).toBeNull();
  });

  it("読み上げないようにする", () => {
    const { container } = render(<AmountBar amount={250} max={1000} />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
