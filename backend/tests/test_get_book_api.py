"""書籍1件取得API GET /api/books/{book_id} のテスト"""

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Book

# --- 正常系 ---


def test_get_book_returns_created_book(client: TestClient):
    created = client.post(
        "/api/books",
        json={
            "isbn": "9784003101018",
            "title": "テスト書籍",
            "author": "著者A,著者B",
            "publisher": "テスト出版",
            "published_date": "2024-05",
            "list_price": 1980,
            "cover_image_url": "https://example.com/cover.jpg",
        },
    ).json()

    response = client.get(f"/api/books/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_get_book_returns_only_specified_book(client: TestClient):
    client.post("/api/books", json={"title": "1冊目"})
    second = client.post("/api/books", json={"title": "2冊目"}).json()
    client.post("/api/books", json={"title": "3冊目"})

    response = client.get(f"/api/books/{second['id']}")

    assert response.status_code == 200
    assert response.json() == second


def test_get_book_returns_null_disposed_on_for_book_at_hand(client: TestClient):
    created = client.post("/api/books", json={"title": "手元にある本"}).json()

    response = client.get(f"/api/books/{created['id']}")

    assert response.json()["disposed_on"] is None


def test_get_book_returns_disposed_on(client: TestClient, session: Session):
    created = client.post("/api/books", json={"title": "手放した本"}).json()
    book = session.get(Book, created["id"])
    assert book is not None
    book.disposed_on = date(2026, 10, 10)
    session.commit()

    response = client.get(f"/api/books/{created['id']}")

    assert response.json()["disposed_on"] == "2026-10-10"


# --- エラー ---


def test_get_book_not_found_returns_404(client: TestClient):
    response = client.get("/api/books/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "ID 999 の本は見つかりません"


def test_get_book_with_non_integer_id_returns_422(client: TestClient):
    response = client.get("/api/books/abc")

    assert response.status_code == 422
