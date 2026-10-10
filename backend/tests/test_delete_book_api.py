"""書籍削除API DELETE /api/books/{book_id} のテスト"""

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Purchase, ReadingRecord


def create_book(client: TestClient, title: str = "削除する本") -> int:
    response = client.post("/api/books", json={"title": title})
    assert response.status_code == 201
    return response.json()["id"]


def add_purchase(session: Session, book_id: int) -> None:
    # 購入記録APIはまだないので、DBに直接入れる
    session.add(Purchase(book_id=book_id, purchased_on=date(2026, 10, 1), amount=1000))
    session.commit()


# --- 正常系 ---


def test_delete_book_returns_204(client: TestClient):
    book_id = create_book(client)

    response = client.delete(f"/api/books/{book_id}")

    assert response.status_code == 204
    assert response.content == b""


def test_deleted_book_cannot_be_retrieved(client: TestClient):
    book_id = create_book(client)

    client.delete(f"/api/books/{book_id}")

    assert client.get(f"/api/books/{book_id}").status_code == 404


def test_delete_book_also_deletes_reading_record(client: TestClient, session: Session):
    book_id = create_book(client)

    client.delete(f"/api/books/{book_id}")

    assert session.scalars(select(ReadingRecord)).all() == []


def test_delete_book_with_purchases(client: TestClient, session: Session):
    book_id = create_book(client)
    add_purchase(session, book_id)

    response = client.delete(f"/api/books/{book_id}")

    assert response.status_code == 204
    assert session.scalars(select(Purchase)).all() == []


def test_delete_book_keeps_other_books(client: TestClient, session: Session):
    book_id = create_book(client)
    other_id = create_book(client, title="残る本")
    add_purchase(session, book_id)
    add_purchase(session, other_id)

    client.delete(f"/api/books/{book_id}")

    assert client.get(f"/api/books/{other_id}").status_code == 200
    assert session.scalars(select(ReadingRecord.book_id)).all() == [other_id]
    assert session.scalars(select(Purchase.book_id)).all() == [other_id]


# --- エラー ---


def test_delete_book_not_found_returns_404(client: TestClient):
    response = client.delete("/api/books/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "ID 999 の本は見つかりません"


def test_delete_book_with_non_integer_id_returns_422(client: TestClient):
    response = client.delete("/api/books/abc")

    assert response.status_code == 422


def test_delete_book_twice_returns_404(client: TestClient):
    book_id = create_book(client)
    client.delete(f"/api/books/{book_id}")

    response = client.delete(f"/api/books/{book_id}")

    assert response.status_code == 404
