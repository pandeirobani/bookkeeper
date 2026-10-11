import { Route, Routes } from "react-router";
import Layout from "./components/Layout.tsx";
import BookCreatePage from "./pages/BookCreatePage.tsx";
import BookListPage from "./pages/BookListPage.tsx";
import NotFoundPage from "./pages/NotFoundPage.tsx";

// <BrowserRouter> は main.tsx で囲む。テストでは <MemoryRouter> に差し替える
function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<BookListPage />} />
        <Route path="books/new" element={<BookCreatePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
