import { useCallback } from "react";
import { Link, useParams } from "react-router";
import { type Book, fetchBook } from "../api/books.ts";
import BookCover from "../components/BookCover.tsx";
import DeleteSection from "../components/DeleteSection.tsx";
import DisposalSection from "../components/DisposalSection.tsx";
import ErrorMessage from "../components/ErrorMessage.tsx";
import ReadingRecordSection from "../components/ReadingRecordSection.tsx";
import SuccessMessage from "../components/SuccessMessage.tsx";
import { useApiData } from "../hooks/useApiData.ts";
import { useFlashMessage } from "../hooks/useFlashMessage.ts";
import { formatDate, formatLocalDate } from "../utils/date.ts";
import { formatYen, parseId } from "../utils/format.ts";
import BookNotFound from "./BookNotFound.tsx";
import styles from "./BookDetailPage.module.css";

function BookInfo({ book }: { book: Book }) {
  const items: [string, string | null][] = [
    ["著者", book.author],
    ["出版社", book.publisher],
    ["出版日", book.published_date],
    ["ISBN", book.isbn],
    ["定価", book.list_price === null ? null : formatYen(book.list_price)],
    ["登録日", formatLocalDate(book.created_at)],
  ];
  if (book.disposed_on !== null) {
    items.push(["手放した日", formatDate(book.disposed_on)]);
  }
  return (
    <dl className={styles.info}>
      {items.map(([label, value]) => (
        <div key={label} className={styles.infoItem}>
          <dt>{label}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function BookDetail({ bookId }: { bookId: number }) {
  const message = useFlashMessage();
  const book = useApiData(useCallback(() => fetchBook(bookId), [bookId]));

  if (book.status === "loading") {
    return <p>読み込み中…</p>;
  }
  if (book.status === "error") {
    if (book.error.status === 404) {
      return <BookNotFound />;
    }
    return <ErrorMessage messages={book.error.details.map((detail) => detail.msg)} />;
  }
  return (
    <>
      <SuccessMessage message={message} />
      <div className={styles.header}>
        <BookCover key={book.data.cover_image_url} url={book.data.cover_image_url} />
        <div>
          <h2>{book.data.title}</h2>
          <BookInfo book={book.data} />
          <p className={styles.editLink}>
            <Link to={`/books/${bookId}/edit`}>書誌情報を編集</Link>
          </p>
        </div>
      </div>
      <ReadingRecordSection bookId={bookId} />
      <DisposalSection book={book.data} onChanged={book.reload} />
      <DeleteSection book={book.data} />
    </>
  );
}

function BookDetailPage() {
  const bookId = parseId(useParams().bookId);
  if (bookId === null) {
    return <BookNotFound />;
  }
  // 別の本に移ったときは、表示や入力中の値を引き継がない
  return <BookDetail key={bookId} bookId={bookId} />;
}

export default BookDetailPage;
