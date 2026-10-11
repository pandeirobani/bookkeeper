import { useState } from "react";
import styles from "./BookCover.module.css";

type Props = {
  url: string | null;
};

/**
 * 表紙の画像。URLがないときや、読み込めないとき（オフラインなど）は代わりの枠を出す。
 *
 * URLが変わったときに読み込みの失敗をリセットするため、呼び出し側で key={url} を付ける
 */
function BookCover({ url }: Props) {
  const [failed, setFailed] = useState(false);

  if (url === null || failed) {
    return (
      <div role="img" aria-label="表紙の画像なし" className={styles.placeholder}>
        表紙なし
      </div>
    );
  }
  return <img src={url} alt="表紙" onError={() => setFailed(true)} className={styles.cover} />;
}

export default BookCover;
