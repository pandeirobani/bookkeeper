import styles from "./AmountBar.module.css";

type Props = {
  amount: number;
  /** 表の中で一番大きい金額。この金額を棒の幅いっぱいにする */
  max: number;
};

/**
 * 金額の大きさを表す横棒。表の各行に置いて、行どうしの金額を見比べやすくする。
 *
 * 金額は表に文字でも出すので、棒は読み上げない（aria-hidden）。
 * 0円の行には棒を出さない
 */
function AmountBar({ amount, max }: Props) {
  const ratio = max > 0 ? Math.min(amount / max, 1) : 0;

  return (
    <span aria-hidden="true" className={styles.track}>
      {ratio > 0 && <span className={styles.bar} style={{ width: `${ratio * 100}%` }} />}
    </span>
  );
}

export default AmountBar;
