"""購入記録削除API DELETE /api/purchases/{purchase_id} のテスト"""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Book, Purchase


def create_book(client: TestClient) -> int:
    response = client.post("/api/books", json={"title": "テスト書籍"})
    assert response.status_code == 201
    return response.json()["id"]


def create_purchase(client: TestClient, book_id: int) -> int:
    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={"purchased_on": "2026-10-01", "amount": 1980},
    )
    assert response.status_code == 201
    return response.json()["id"]


# --- 正常系 ---


def test_delete_purchase_returns_204(client: TestClient):
    purchase_id = create_purchase(client, create_book(client))

    response = client.delete(f"/api/purchases/{purchase_id}")

    assert response.status_code == 204
    assert response.content == b""


def test_delete_purchase_removes_from_db(client: TestClient, session: Session):
    purchase_id = create_purchase(client, create_book(client))

    client.delete(f"/api/purchases/{purchase_id}")

    assert session.get(Purchase, purchase_id) is None


def test_delete_purchase_keeps_book(client: TestClient, session: Session):
    book_id = create_book(client)
    purchase_id = create_purchase(client, book_id)

    client.delete(f"/api/purchases/{purchase_id}")

    assert session.get(Book, book_id) is not None


def test_delete_purchase_keeps_other_purchases(client: TestClient, session: Session):
    book_id = create_book(client)
    purchase_id = create_purchase(client, book_id)
    same_book_id = create_purchase(client, book_id)
    other_book_id = create_purchase(client, create_book(client))

    client.delete(f"/api/purchases/{purchase_id}")

    remaining = session.scalars(select(Purchase.id).order_by(Purchase.id)).all()
    assert remaining == [same_book_id, other_book_id]


# --- エラー ---


def test_delete_unknown_purchase_returns_404(client: TestClient):
    response = client.delete("/api/purchases/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "ID 999 の購入記録は見つかりません"


def test_delete_purchase_with_non_integer_id_returns_422(client: TestClient):
    response = client.delete("/api/purchases/abc")

    assert response.status_code == 422


def test_delete_purchase_twice_returns_404(client: TestClient):
    purchase_id = create_purchase(client, create_book(client))
    client.delete(f"/api/purchases/{purchase_id}")

    response = client.delete(f"/api/purchases/{purchase_id}")

    assert response.status_code == 404
