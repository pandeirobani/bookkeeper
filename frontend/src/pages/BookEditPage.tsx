import { useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import { type BookInput, fetchBook, updateBook } from "../api/books.ts";
import BookForm from "../components/BookForm.tsx";
import ErrorMessage from "../components/ErrorMessage.tsx";
import { toBookFormValues } from "../components/bookFormValues.ts";
import { useApiData } from "../hooks/useApiData.ts";
import { withFlashMessage } from "../hooks/useFlashMessage.ts";
import { parseId } from "../utils/format.ts";
import BookNotFound from "./BookNotFound.tsx";

function BookEdit({ bookId }: { bookId: number }) {
  const navigate = useNavigate();
  const book = useApiData(useCallback(() => fetchBook(bookId), [bookId]));

  async function handleSubmit(input: BookInput) {
    await updateBook(bookId, input);
    navigate(`/books/${bookId}`, withFlashMessage("書誌情報を更新しました"));
  }

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
      <h2>書誌情報を編集</h2>
      <BookForm
        initialValues={toBookFormValues(book.data)}
        submitLabel="保存する"
        submittingLabel="保存中…"
        cancelTo={`/books/${bookId}`}
        onSubmit={handleSubmit}
      />
    </>
  );
}

function BookEditPage() {
  const bookId = parseId(useParams().bookId);
  if (bookId === null) {
    return <BookNotFound />;
  }
  return <BookEdit key={bookId} bookId={bookId} />;
}

export default BookEditPage;
