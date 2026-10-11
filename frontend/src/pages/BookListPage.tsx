import { Link } from "react-router";
import { type Book, fetchBooks } from "../api/books.ts";
import ErrorMessage from "../components/ErrorMessage.tsx";
import SuccessMessage from "../components/SuccessMessage.tsx";
import { useApiData } from "../hooks/useApiData.ts";
import { useFlashMessage } from "../hooks/useFlashMessage.ts";
import { formatDate } from "../utils/date.ts";
import styles from "./BookListPage.module.css";

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
  const message = useFlashMessage();

  return (
    <>
      <h2 id="book-list-heading">本の一覧</h2>
      <SuccessMessage message={message} />
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
