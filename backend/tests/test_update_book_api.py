"""書籍更新API PUT /api/books/{book_id} のテスト"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Book, ReadingRecord

ALL_FIELDS = {
    "isbn": "9784003101018",
    "title": "更新後の書名",
    "author": "著者A,著者B",
    "publisher": "テスト出版",
    "published_date": "2024-05",
    "list_price": 1980,
    "cover_image_url": "https://example.com/cover.jpg",
}


def create_book(client: TestClient, **fields: object) -> dict[str, object]:
    response = client.post("/api/books", json={"title": "更新前の書名", **fields})
    assert response.status_code == 201
    return response.json()


# --- 正常系 ---


def test_update_book_replaces_all_fields(client: TestClient):
    created = create_book(client)

    response = client.put(f"/api/books/{created['id']}", json=ALL_FIELDS)

    assert response.status_code == 200
    body = response.json()
    assert {k: v for k, v in body.items() if k not in ("id", "created_at")} == (
        ALL_FIELDS
    )


def test_update_book_saves_to_db(client: TestClient, session: Session):
    created = create_book(client)

    client.put(f"/api/books/{created['id']}", json=ALL_FIELDS)

    book = session.get(Book, created["id"])
    assert book is not None
    assert book.title == "更新後の書名"
    assert book.isbn == "9784003101018"


def test_update_book_keeps_id_and_created_at(client: TestClient):
    created = create_book(client)

    body = client.put(f"/api/books/{created['id']}", json=ALL_FIELDS).json()

    assert body["id"] == created["id"]
    assert body["created_at"] == created["created_at"]


def test_omitted_fields_become_null(client: TestClient):
    created = create_book(client, isbn="9784003101018", author="著者A", list_price=1980)

    response = client.put(f"/api/books/{created['id']}", json={"title": "書名だけ"})

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "書名だけ"
    for key in ("isbn", "author", "publisher", "published_date", "list_price"):
        assert body[key] is None


def test_update_book_with_its_own_isbn(client: TestClient):
    created = create_book(client, isbn="9784003101018")

    response = client.put(
        f"/api/books/{created['id']}",
        json={"isbn": "9784003101018", "title": "書名だけ変更"},
    )

    assert response.status_code == 200
    assert response.json()["title"] == "書名だけ変更"


def test_update_book_does_not_change_reading_record(
    client: TestClient, session: Session
):
    created = create_book(client)
    record = session.scalar(
        select(ReadingRecord).where(ReadingRecord.book_id == created["id"])
    )
    assert record is not None
    record.status = "reading"
    record.memo = "読書メモ"
    session.commit()

    client.put(f"/api/books/{created['id']}", json=ALL_FIELDS)

    session.refresh(record)
    assert record.status == "reading"
    assert record.memo == "読書メモ"


def test_update_book_does_not_change_disposed_on(client: TestClient, session: Session):
    # 手放した日は書誌情報ではないので、書誌情報の更新では変えない
    created = create_book(client)
    book = session.get(Book, created["id"])
    assert book is not None
    book.disposed_on = date(2026, 10, 10)
    session.commit()

    client.put(f"/api/books/{created['id']}", json=ALL_FIELDS)

    session.refresh(book)
    assert book.disposed_on == date(2026, 10, 10)


# --- 入力値の正規化 ---


def test_isbn10_with_hyphens_is_saved_as_isbn13(client: TestClient):
    created = create_book(client)

    response = client.put(
        f"/api/books/{created['id']}",
        json={"isbn": "4-87311-778-X", "title": "テスト書籍"},
    )

    assert response.status_code == 200
    assert response.json()["isbn"] == "9784873117782"


def test_blank_strings_are_saved_as_null(client: TestClient):
    created = create_book(client, isbn="9784003101018", author="著者A")

    response = client.put(
        f"/api/books/{created['id']}",
        json={
            "isbn": "",
            "title": "テスト書籍",
            "author": "",
            "publisher": "  ",
            "published_date": "",
            "cover_image_url": "",
        },
    )

    assert response.status_code == 200
    body = response.json()
    for key in ("isbn", "author", "publisher", "published_date", "cover_image_url"):
        assert body[key] is None


# --- 重複 ---


def test_isbn_of_another_book_returns_409(client: TestClient, session: Session):
    create_book(client, isbn="9784003101018")
    target = create_book(client, isbn="9784873117782")

    response = client.put(
        f"/api/books/{target['id']}",
        json={"isbn": "9784003101018", "title": "別の書名"},
    )

    assert response.status_code == 409
    book = session.get(Book, target["id"])
    assert book is not None
    assert book.isbn == "9784873117782"
    assert book.title == "更新前の書名"


def test_isbn10_of_another_book_is_detected_as_duplicate(client: TestClient):
    create_book(client, isbn="9784003101018")
    target = create_book(client)

    response = client.put(
        f"/api/books/{target['id']}", json={"isbn": "4003101014", "title": "書名"}
    )

    assert response.status_code == 409


# --- エラー ---


def test_update_book_not_found_returns_404(client: TestClient):
    response = client.put("/api/books/999", json=ALL_FIELDS)

    assert response.status_code == 404
    assert response.json()["detail"] == "ID 999 の本は見つかりません"


def test_update_book_with_non_integer_id_returns_422(client: TestClient):
    response = client.put("/api/books/abc", json=ALL_FIELDS)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {},  # title なし
        {"title": ""},
        {"title": "   "},
        {"title": "テスト書籍", "list_price": -1},
        {"title": "テスト書籍", "isbn": "9784003101019"},  # チェックディジット違い
        {"title": "テスト書籍", "isbn": "abc"},
    ],
)
def test_invalid_payload_returns_422(
    client: TestClient, session: Session, payload: dict[str, object]
):
    created = create_book(client)

    response = client.put(f"/api/books/{created['id']}", json=payload)

    assert response.status_code == 422
    book = session.get(Book, created["id"])
    assert book is not None
    assert book.title == "更新前の書名"
