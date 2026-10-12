import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { type Book, fetchBooks } from "../api/books.ts";
import ErrorMessage from "../components/ErrorMessage.tsx";
import FormField from "../components/FormField.tsx";
import SuccessMessage from "../components/SuccessMessage.tsx";
import { useApiData } from "../hooks/useApiData.ts";
import { useFlashMessage } from "../hooks/useFlashMessage.ts";
import { formatDate } from "../utils/date.ts";
import { matchesBookQuery } from "../utils/search.ts";
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
              <Link to={`/books/${book.id}`}>{book.title}</Link>
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

/** 検索欄と、検索語で絞り込んだ本の表 */
function SearchableBookTable({ books }: { books: Book[] }) {
  // 検索語は URL（/?q=…）にも持たせ、詳細画面から戻っても検索の結果が残るようにする
  const [searchParams, setSearchParams] = useSearchParams();
  // 検索欄の値は URL から取らず、この画面の状態として持つ。
  // React Router は URL の変更を startTransition で後から反映するため、URL から取ると
  // 入力の直後に値が一瞬元に戻り、日本語入力（IME）の変換中の文字が二重になる
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const isSearching = query.trim() !== "";
  const matchedBooks = isSearching ? books.filter((book) => matchesBookQuery(book, query)) : books;

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

  return (
    <>
      <search className={styles.search}>
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
      </search>
      {/* 絞り込んだ件数を読み上げでも伝える。role="status" は完了メッセージの欄に使っているので付けない */}
      <p className={styles.count} aria-live="polite">
        {isSearching ? `全${books.length}冊中${matchedBooks.length}冊` : `全${books.length}冊`}
      </p>
      {matchedBooks.length === 0 ? (
        <p>「{query.trim()}」に一致する本はありません</p>
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
