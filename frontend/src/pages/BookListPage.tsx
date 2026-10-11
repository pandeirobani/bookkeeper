import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { type Book, fetchBooks } from "../api/books.ts";
import ErrorMessage from "../components/ErrorMessage.tsx";
import { useApiData } from "../hooks/useApiData.ts";
import { formatDate } from "../utils/date.ts";
import styles from "./BookListPage.module.css";

/** 前の画面から渡されたメッセージ（「〜を登録しました」など）を取り出す */
function readMessage(state: unknown): string | null {
  if (typeof state === "object" && state !== null && "message" in state) {
    return typeof state.message === "string" ? state.message : null;
  }
  return null;
}

function BookTable({ books }: { books: Book[] }) {
  return (
    <table className={styles.table} aria-labelledby="book-list-heading">
      <thead>
        <tr>
          <th scope="col">書名</th>
          <th scope="col">著者</th>
          <th scope="col">出版社</th>
          <th scope="col">出版日</th>
          <th scope="col">手放した日</th>
        </tr>
      </thead>
      <tbody>
        {books.map((book) => (
          // 手放した本も一覧に残し、薄く表示して区別する
          <tr key={book.id} className={book.disposed_on === null ? undefined : styles.disposed}>
            <th scope="row" className={styles.title}>
              {book.title}
            </th>
            <td>{book.author}</td>
            <td>{book.publisher}</td>
            <td>{book.published_date}</td>
            <td>{book.disposed_on === null ? null : formatDate(book.disposed_on)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BookListPage() {
  const books = useApiData(fetchBooks);
  const location = useLocation();
  const navigate = useNavigate();
  const [message] = useState(() => readMessage(location.state));

  // 表示したメッセージは履歴から消し、再読み込みや「戻る」でもう一度出ないようにする
  useEffect(() => {
    if (message !== null) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [message, navigate, location.pathname]);

  return (
    <>
      <h2 id="book-list-heading">本の一覧</h2>
      {message !== null && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}
      {books.status === "loading" && <p>読み込み中…</p>}
      {books.status === "error" && (
        <ErrorMessage messages={books.error.details.map((detail) => detail.msg)} />
      )}
      {books.status === "success" &&
        (books.data.length === 0 ? (
          <p>
            まだ本が登録されていません。<Link to="/books/new">本を登録する</Link>
          </p>
        ) : (
          <>
            <p className={styles.count}>全{books.data.length}冊</p>
            <BookTable books={books.data} />
          </>
        ))}
    </>
  );
}

export default BookListPage;
