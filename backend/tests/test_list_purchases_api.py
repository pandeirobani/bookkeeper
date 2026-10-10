"""購入記録一覧取得API GET /api/books/{book_id}/purchases のテスト"""

from fastapi.testclient import TestClient


def create_book(client: TestClient, title: str = "テスト書籍") -> int:
    response = client.post("/api/books", json={"title": title})
    assert response.status_code == 201
    return response.json()["id"]


def create_purchase(
    client: TestClient, book_id: int, purchased_on: str = "2026-10-01"
) -> dict[str, object]:
    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={"purchased_on": purchased_on, "amount": 1980},
    )
    assert response.status_code == 201
    return response.json()


# --- 正常系 ---


def test_list_purchases_returns_empty_list(client: TestClient):
    book_id = create_book(client)

    response = client.get(f"/api/books/{book_id}/purchases")

    assert response.status_code == 200
    assert response.json() == []


def test_list_purchases_returns_created_purchase(client: TestClient):
    book_id = create_book(client)
    created = create_purchase(client, book_id)

    response = client.get(f"/api/books/{book_id}/purchases")

    assert response.json() == [created]


def test_list_purchases_is_ordered_by_purchased_on_desc(client: TestClient):
    book_id = create_book(client)
    middle = create_purchase(client, book_id, "2026-05-01")
    newest = create_purchase(client, book_id, "2026-10-01")
    oldest = create_purchase(client, book_id, "2025-12-31")

    body = client.get(f"/api/books/{book_id}/purchases").json()

    assert [p["id"] for p in body] == [newest["id"], middle["id"], oldest["id"]]


def test_purchases_on_same_day_are_ordered_by_id_desc(client: TestClient):
    book_id = create_book(client)
    first = create_purchase(client, book_id)
    second = create_purchase(client, book_id)

    body = client.get(f"/api/books/{book_id}/purchases").json()

    assert [p["id"] for p in body] == [second["id"], first["id"]]


def test_list_purchases_excludes_other_books(client: TestClient):
    book_id = create_book(client)
    other_id = create_book(client, title="別の本")
    own = create_purchase(client, book_id)
    create_purchase(client, other_id)

    body = client.get(f"/api/books/{book_id}/purchases").json()

    assert [p["id"] for p in body] == [own["id"]]


# --- エラー ---


def test_list_purchases_for_unknown_book_returns_404(client: TestClient):
    response = client.get("/api/books/999/purchases")

    assert response.status_code == 404
    assert response.json()["detail"] == "ID 999 の本は見つかりません"


def test_list_purchases_with_non_integer_book_id_returns_422(client: TestClient):
    response = client.get("/api/books/abc/purchases")

    assert response.status_code == 422
