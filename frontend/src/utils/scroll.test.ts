import { describe, expect, it } from "vitest";
import { scrollOffsetToReveal } from "./scroll.ts";

// 画面の高さ 800px・余白 16px。要素を見せられる範囲は、画面の上端から 16px〜784px
const VIEWPORT = 800;
const MARGIN = 16;

describe("scrollOffsetToReveal", () => {
  it("要素の全体が見えていればスクロールしない", () => {
    expect(scrollOffsetToReveal(100, 500, VIEWPORT, MARGIN)).toBe(0);
  });

  it("余白を含めてちょうど見えていればスクロールしない", () => {
    expect(scrollOffsetToReveal(16, 784, VIEWPORT, MARGIN)).toBe(0);
  });

  it("画面に収まり、下にはみ出していれば、下端が画面の下に来るまでスクロールする", () => {
    // 下端 1200px を 784px に合わせる
    expect(scrollOffsetToReveal(900, 1200, VIEWPORT, MARGIN)).toBe(416);
  });

  it("画面に収まり、上にはみ出していれば、上端が画面の上に来るまで戻す", () => {
    expect(scrollOffsetToReveal(-200, 300, VIEWPORT, MARGIN)).toBe(-216);
  });

  it("画面にちょうど収まる高さなら、下端を画面の下に合わせる", () => {
    // 高さ 768px（800 - 16 × 2）
    expect(scrollOffsetToReveal(500, 1268, VIEWPORT, MARGIN)).toBe(484);
  });

  it("画面に収まらなければ、上端が画面の上に来るまでスクロールする", () => {
    // 高さ 769px
    expect(scrollOffsetToReveal(500, 1269, VIEWPORT, MARGIN)).toBe(484);
    expect(scrollOffsetToReveal(900, 3000, VIEWPORT, MARGIN)).toBe(884);
  });

  it("画面に収まらず、上端が画面の上にはみ出していれば戻す", () => {
    expect(scrollOffsetToReveal(-500, 2000, VIEWPORT, MARGIN)).toBe(-516);
  });
});
