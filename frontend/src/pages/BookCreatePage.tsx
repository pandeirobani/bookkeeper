import { useNavigate } from "react-router";
import { type BookInput, createBook } from "../api/books.ts";
import BookForm from "../components/BookForm.tsx";

function BookCreatePage() {
  const navigate = useNavigate();

  async function handleSubmit(input: BookInput) {
    const book = await createBook(input);
    // 段階3で、登録した本の詳細画面に移るように変える
    navigate("/", { state: { message: `「${book.title}」を登録しました` } });
  }

  return (
    <>
      <h2>本を登録</h2>
      <BookForm submitLabel="登録する" submittingLabel="登録中…" onSubmit={handleSubmit} />
    </>
  );
}

export default BookCreatePage;
