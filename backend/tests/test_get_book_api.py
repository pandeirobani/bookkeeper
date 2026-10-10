"""書籍1件取得API GET /api/books/{book_id} のテスト"""

from fastapi.testclient import TestClient

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


# --- エラー ---


def test_get_book_not_found_returns_404(client: TestClient):
    response = client.get("/api/books/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "ID 999 の本は見つかりません"


def test_get_book_with_non_integer_id_returns_422(client: TestClient):
    response = client.get("/api/books/abc")

    assert response.status_code == 422
