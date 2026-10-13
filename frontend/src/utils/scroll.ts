/**
 * 要素の全体を画面に見せるために、縦にスクロールする量（px）を返す。0 ならスクロールしない。
 *
 * - 要素が画面に収まるなら、必要な分だけスクロールする。
 *   下にはみ出していれば下端を画面の下に、上にはみ出していれば上端を画面の上に合わせる
 * - 要素が画面に収まらないなら、上端を画面の上に合わせる
 *
 * top・bottom は getBoundingClientRect() の値（画面の上端からの位置）。
 * 画面の上下の端には margin の余白を取る
 */
export function scrollOffsetToReveal(
  top: number,
  bottom: number,
  viewportHeight: number,
  margin: number,
): number {
  const fits = bottom - top <= viewportHeight - margin * 2;
  if (!fits || top < margin) {
    return top - margin;
  }
  return Math.max(0, bottom - (viewportHeight - margin));
}
