import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { type BookListItem, fetchBooks } from "../api/books.ts";
import {
  READING_STATUSES,
  READING_STATUS_LABELS,
  type ReadingStatus,
} from "../api/readingRecords.ts";
import ErrorMessage from "../components/ErrorMessage.tsx";
import FormField from "../components/FormField.tsx";
import SuccessMessage from "../components/SuccessMessage.tsx";
import { useApiData } from "../hooks/useApiData.ts";
import { useFlashMessage } from "../hooks/useFlashMessage.ts";
import { formatDate } from "../utils/date.ts";
import { matchesBookQuery, matchesReadingStatuses, parseReadingStatuses } from "../utils/search.ts";
import styles from "./BookListPage.module.css";

function BookTable({ books }: { books: BookListItem[] }) {
  return (
    <table className={styles.table} aria-labelledby="book-list-heading">
      <thead>
        <tr>
          <th scope="col">書名</th>
          <th scope="col">著者</th>
          <th scope="col">出版社</th>
          <th scope="col">出版日</th>
          <th scope="col">状態</th>
          <th scope="col">手放した日</th>
        </tr>
      </thead>
      <tbody>
        {books.map((book) => (
          // 手放した本も一覧に残し、薄く表示して区別する
          <tr key={book.id} className={book.disposed_on === null ? undefined : styles.disposed}>
            <th scope="row" className={styles.title}>
              <Link to={`/books/${book.id}`}>{book.title}</Link>
            </th>
            <td>{book.author}</td>
            <td>{book.publisher}</td>
            <td>{book.published_date}</td>
            {/* 読書記録がない本（DBを直接変更した場合）は空欄にする */}
            <td className={styles.nowrap}>
              {book.reading_status === null ? null : READING_STATUS_LABELS[book.reading_status]}
            </td>
            <td>{book.disposed_on === null ? null : formatDate(book.disposed_on)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 検索欄・読書状態の絞り込みと、それで絞り込んだ本の表 */
function SearchableBookTable({ books }: { books: BookListItem[] }) {
  // 検索語と読書状態は URL（/?q=…&status=…）にも持たせ、詳細画面から戻っても絞り込みが残るようにする
  const [searchParams, setSearchParams] = useSearchParams();
  // 検索欄の値は URL から取らず、この画面の状態として持つ。
  // React Router は URL の変更を startTransition で後から反映するため、URL から取ると
  // 入力の直後に値が一瞬元に戻り、日本語入力（IME）の変換中の文字が二重になる
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  // チェックボックスも、クリックの直後に表示が一瞬戻らないよう、同じく画面の状態として持つ
  const [statuses, setStatuses] = useState(() =>
    parseReadingStatuses(searchParams.getAll("status")),
  );
  const isFiltering = query.trim() !== "" || statuses.length > 0;
  const matchedBooks = isFiltering
    ? books.filter(
        (book) =>
          matchesBookQuery(book, query) && matchesReadingStatuses(book.reading_status, statuses),
      )
    : books;

  function handleQueryChange(value: string) {
    setQuery(value);
    setSearchParams(
      (params) => {
        if (value === "") {
          params.delete("q");
        } else {
          params.set("q", value);
        }
        return params;
      },
      // 1文字入力するごとに履歴が増えないようにする
      { replace: true },
    );
  }

  function handleStatusChange(status: ReadingStatus, checked: boolean) {
    // URL での並びがクリックの順で変わらないよう、いつも 未読・読書中・読了 の順にする
    const next = READING_STATUSES.filter((s) => (s === status ? checked : statuses.includes(s)));
    setStatuses(next);
    setSearchParams(
      (params) => {
        params.delete("status");
        for (const s of next) {
          params.append("status", s);
        }
        return params;
      },
      // 検索語と同じく、絞り込みを変えるたびに履歴が増えないようにする
      { replace: true },
    );
  }

  return (
    <>
      <search className={styles.search}>
        <div className={styles.query}>
          <FormField
            id="book-search"
            label="書名・著者で検索"
            hint="空白で区切ると、すべての語を含む本を探します"
          >
            {(controlProps) => (
              <input
                {...controlProps}
                type="search"
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <fieldset className={styles.statuses}>
          <legend className={styles.legend}>読書状態</legend>
          {READING_STATUSES.map((status) => (
            <label key={status} className={styles.statusOption}>
              <input
                type="checkbox"
                checked={statuses.includes(status)}
                onChange={(event) => handleStatusChange(status, event.target.checked)}
              />
              {READING_STATUS_LABELS[status]}
            </label>
          ))}
        </fieldset>
      </search>
      {/* 絞り込んだ件数を読み上げでも伝える。role="status" は完了メッセージの欄に使っているので付けない */}
      <p className={styles.count} aria-live="polite">
        {isFiltering ? `全${books.length}冊中${matchedBooks.length}冊` : `全${books.length}冊`}
      </p>
      {matchedBooks.length === 0 ? (
        <p>条件に一致する本はありません</p>
      ) : (
        <BookTable books={matchedBooks} />
      )}
    </>
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
          <SearchableBookTable books={books.data} />
        ))}
    </>
  );
}

export default BookListPage;
