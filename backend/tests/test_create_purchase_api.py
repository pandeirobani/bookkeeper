"""購入記録追加API POST /api/books/{book_id}/purchases のテスト"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Book, Purchase

ALL_FIELDS = {
    "purchased_on": "2026-10-01",
    "amount": 1980,
    "store": "テスト書店",
    "memo": "セールで購入",
}


def create_book(client: TestClient) -> int:
    response = client.post("/api/books", json={"title": "テスト書籍"})
    assert response.status_code == 201
    return response.json()["id"]


# --- 正常系 ---


def test_create_purchase_with_all_fields(client: TestClient):
    book_id = create_book(client)

    response = client.post(f"/api/books/{book_id}/purchases", json=ALL_FIELDS)

    assert response.status_code == 201
    body = response.json()
    assert isinstance(body["id"], int)
    assert body["created_at"] is not None
    assert {k: v for k, v in body.items() if k not in ("id", "created_at")} == {
        "book_id": book_id,
        **ALL_FIELDS,
    }


def test_create_purchase_with_required_fields_only(client: TestClient):
    book_id = create_book(client)

    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={"purchased_on": "2026-10-01", "amount": 1980},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["store"] is None
    assert body["memo"] is None


def test_create_purchase_saves_to_db(client: TestClient, session: Session):
    book_id = create_book(client)

    created = client.post(f"/api/books/{book_id}/purchases", json=ALL_FIELDS).json()

    purchase = session.get(Purchase, created["id"])
    assert purchase is not None
    assert purchase.book_id == book_id
    assert purchase.purchased_on == date(2026, 10, 1)
    assert purchase.amount == 1980


def test_same_book_can_have_multiple_purchases(client: TestClient, session: Session):
    book_id = create_book(client)

    client.post(f"/api/books/{book_id}/purchases", json=ALL_FIELDS)
    client.post(f"/api/books/{book_id}/purchases", json=ALL_FIELDS)

    assert session.query(Purchase).filter_by(book_id=book_id).count() == 2


def test_amount_zero_is_allowed(client: TestClient):
    # もらった本などに0円で記録できる
    book_id = create_book(client)

    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={"purchased_on": "2026-10-01", "amount": 0},
    )

    assert response.status_code == 201


def test_future_purchased_on_is_allowed(client: TestClient):
    # 予約購入もあるので未来の日付も受け付ける
    book_id = create_book(client)

    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={"purchased_on": "2099-01-01", "amount": 1980},
    )

    assert response.status_code == 201


def test_create_purchase_does_not_change_disposed_on(
    client: TestClient, session: Session
):
    # 手放した日を戻すかは利用者が決めるので、購入の追加では変えない
    book_id = create_book(client)
    book = session.get(Book, book_id)
    assert book is not None
    book.disposed_on = date(2026, 9, 1)
    session.commit()

    client.post(f"/api/books/{book_id}/purchases", json=ALL_FIELDS)

    session.refresh(book)
    assert book.disposed_on == date(2026, 9, 1)


# --- 入力値の正規化 ---


def test_blank_strings_are_saved_as_null(client: TestClient):
    book_id = create_book(client)

    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={**ALL_FIELDS, "store": "", "memo": "  "},
    )

    body = response.json()
    assert body["store"] is None
    assert body["memo"] is None


def test_store_and_memo_are_stripped(client: TestClient):
    book_id = create_book(client)

    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={**ALL_FIELDS, "store": "  テスト書店  ", "memo": " メモ "},
    )

    body = response.json()
    assert body["store"] == "テスト書店"
    assert body["memo"] == "メモ"


# --- エラー ---


def test_create_purchase_for_unknown_book_returns_404(
    client: TestClient, session: Session
):
    response = client.post("/api/books/999/purchases", json=ALL_FIELDS)

    assert response.status_code == 404
    assert response.json()["detail"] == "ID 999 の本は見つかりません"
    assert session.query(Purchase).count() == 0


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"amount": 1980},  # purchased_on なし
        {"purchased_on": "2026-10-01"},  # amount なし
        {"purchased_on": "2026-10-01", "amount": -1},
        {"purchased_on": "2026-10-01", "amount": 19.8},
        {"purchased_on": "2026-13-01", "amount": 1980},
        {"purchased_on": "", "amount": 1980},
    ],
)
def test_invalid_payload_returns_422(
    client: TestClient, session: Session, payload: dict[str, object]
):
    book_id = create_book(client)

    response = client.post(f"/api/books/{book_id}/purchases", json=payload)

    assert response.status_code == 422
    assert session.query(Purchase).count() == 0


def test_create_purchase_with_non_integer_book_id_returns_422(client: TestClient):
    response = client.post("/api/books/abc/purchases", json=ALL_FIELDS)

    assert response.status_code == 422
