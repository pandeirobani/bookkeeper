import { Link } from "react-router";

function NotFoundPage() {
  return (
    <>
      <h2>ページが見つかりません</h2>
      <p>
        URLに誤りがないか確認してください。<Link to="/">本の一覧に戻る</Link>
      </p>
    </>
  );
}

export default NotFoundPage;
