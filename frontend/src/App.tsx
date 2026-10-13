import { Route, Routes } from "react-router";
import Layout from "./components/Layout.tsx";
import BookCreatePage from "./pages/BookCreatePage.tsx";
import BookDetailPage from "./pages/BookDetailPage.tsx";
import BookEditPage from "./pages/BookEditPage.tsx";
import BookListPage from "./pages/BookListPage.tsx";
import ExpensesPage from "./pages/ExpensesPage.tsx";
import NotFoundPage from "./pages/NotFoundPage.tsx";

// <BrowserRouter> は main.tsx で囲む。テストでは <MemoryRouter> に差し替える
function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<BookListPage />} />
        <Route path="books/new" element={<BookCreatePage />} />
        <Route path="books/:bookId" element={<BookDetailPage />} />
        <Route path="books/:bookId/edit" element={<BookEditPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
