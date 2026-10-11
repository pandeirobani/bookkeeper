import { Link } from "react-router";

/** URLの本が存在しないとき（削除された本や、IDの打ち間違い）の表示 */
function BookNotFound() {
  return (
    <>
      <h2>本が見つかりません</h2>
      <p>
        削除されたか、URLに誤りがある可能性があります。<Link to="/">本の一覧に戻る</Link>
      </p>
    </>
  );
}

export default BookNotFound;
