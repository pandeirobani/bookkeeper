"""手放した日の設定・解除API PUT /api/books/{book_id}/disposal のテスト"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Book, Purchase, ReadingRecord

BOOK_FIELDS = {
    "isbn": "9784003101018",
    "title": "テスト書籍",
    "author": "著者A,著者B",
    "publisher": "テスト出版",
    "published_date": "2024-05",
    "list_price": 1980,
    "cover_image_url": "https://example.com/cover.jpg",
}


def create_book(client: TestClient) -> dict[str, object]:
    response = client.post("/api/books", json=BOOK_FIELDS)
    assert response.status_code == 201
    return response.json()


def set_disposed_on(session: Session, book_id: object, value: date) -> None:
    book = session.get(Book, book_id)
    assert book is not None
    book.disposed_on = value
    session.commit()


# --- 正常系 ---


def test_set_disposed_on(client: TestClient):
    created = create_book(client)

    response = client.put(
        f"/api/books/{created['id']}/disposal", json={"disposed_on": "2026-10-10"}
    )

    assert response.status_code == 200
    assert response.json() == {**created, "disposed_on": "2026-10-10"}


def test_set_disposed_on_saves_to_db(client: TestClient, session: Session):
    created = create_book(client)

    client.put(
        f"/api/books/{created['id']}/disposal", json={"disposed_on": "2026-10-10"}
    )

    book = session.get(Book, created["id"])
    assert book is not None
    assert book.disposed_on == date(2026, 10, 10)


def test_change_disposed_on(client: TestClient, session: Session):
    created = create_book(client)
    set_disposed_on(session, created["id"], date(2026, 10, 10))

    response = client.put(
        f"/api/books/{created['id']}/disposal", json={"disposed_on": "2026-09-01"}
    )

    assert response.status_code == 200
    assert response.json()["disposed_on"] == "2026-09-01"


def test_null_returns_book_to_hand(client: TestClient, session: Session):
    created = create_book(client)
    set_disposed_on(session, created["id"], date(2026, 10, 10))

    response = client.put(
        f"/api/books/{created['id']}/disposal", json={"disposed_on": None}
    )

    assert response.status_code == 200
    assert response.json()["disposed_on"] is None
    book = session.get(Book, created["id"])
    assert book is not None
    session.refresh(book)
    assert book.disposed_on is None


def test_future_date_is_allowed(client: TestClient):
    # 手放す予定日を先に入れておく使い方もできるよう、未来の日付も許可する
    created = create_book(client)

    response = client.put(
        f"/api/books/{created['id']}/disposal", json={"disposed_on": "2099-12-31"}
    )

    assert response.status_code == 200
    assert response.json()["disposed_on"] == "2099-12-31"


def test_disposal_keeps_reading_record_and_purchases(
    client: TestClient, session: Session
):
    # 手放しても、支出の集計と読書の記録のために記録は残す
    created = create_book(client)
    client.post(
        f"/api/books/{created['id']}/purchases",
        json={"purchased_on": "2026-01-01", "amount": 1500},
    )

    client.put(
        f"/api/books/{created['id']}/disposal", json={"disposed_on": "2026-10-10"}
    )

    purchases = session.scalars(
        select(Purchase).where(Purchase.book_id == created["id"])
    ).all()
    assert [p.amount for p in purchases] == [1500]
    record = session.scalar(
        select(ReadingRecord).where(ReadingRecord.book_id == created["id"])
    )
    assert record is not None


# --- エラー ---


def test_not_found_returns_404(client: TestClient):
    response = client.put("/api/books/999/disposal", json={"disposed_on": "2026-10-10"})

    assert response.status_code == 404
    assert response.json()["detail"] == "ID 999 の本は見つかりません"


def test_non_integer_id_returns_422(client: TestClient):
    response = client.put("/api/books/abc/disposal", json={"disposed_on": "2026-10-10"})

    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {},  # 省略すると手元に戻ったのか送り忘れなのか区別できないので拒否する
        {"disposed_on": ""},
        {"disposed_on": "2026/10/10"},
        {"disposed_on": "2026-13-01"},
        {"disposed_on": "abc"},
        {"disposed_at": "2026-10-11"},  # 項目名の打ち間違い
        {"disposed_on": "2026-10-11", "title": "別の書名"},  # 書誌情報は変えられない
    ],
)
def test_invalid_payload_returns_422(
    client: TestClient, session: Session, payload: dict[str, object]
):
    created = create_book(client)
    set_disposed_on(session, created["id"], date(2026, 10, 10))

    response = client.put(f"/api/books/{created['id']}/disposal", json=payload)

    assert response.status_code == 422
    book = session.get(Book, created["id"])
    assert book is not None
    session.refresh(book)
    assert book.disposed_on == date(2026, 10, 10)
