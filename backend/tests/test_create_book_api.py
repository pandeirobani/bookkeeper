"""書籍登録API POST /api/books のテスト"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Book, ReadingRecord
from app.routers import books as books_router

# 同じ本を ISBN-13 と ISBN-10 で表した値
ISBN13 = "9784003101018"
ISBN10 = "4003101014"
# ISBN13 のチェックディジット（末尾の桁）だけを変えた誤った値
ISBN13_WRONG_CHECK_DIGIT = "9784003101019"
# 別の本。ハイフン入りのISBN-10（末尾がX）と、それを変換したISBN-13
OTHER_ISBN10_WITH_HYPHENS = "4-87311-778-X"
OTHER_ISBN13 = "9784873117782"

# --- 正常系 ---


def test_create_book_with_all_fields(client: TestClient):
    response = client.post(
        "/api/books",
        json={
            "isbn": ISBN13,
            "title": "テスト書籍",
            "author": "著者A,著者B",
            "publisher": "テスト出版",
            "published_date": "2024-05",
            "list_price": 1980,
            "cover_image_url": "https://example.com/cover.jpg",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert isinstance(body["id"], int)
    assert body["created_at"] is not None
    assert {k: v for k, v in body.items() if k not in ("id", "created_at")} == {
        "isbn": ISBN13,
        "title": "テスト書籍",
        "author": "著者A,著者B",
        "publisher": "テスト出版",
        "published_date": "2024-05",
        "list_price": 1980,
        "cover_image_url": "https://example.com/cover.jpg",
        "disposed_on": None,
    }


def test_created_at_is_returned_as_utc(client: TestClient):
    before = datetime.now(UTC).replace(microsecond=0)
    response = client.post("/api/books", json={"title": "テスト書籍"})
    after = datetime.now(UTC)

    created_at = response.json()["created_at"]
    # 末尾の Z でUTCとわかるようにし、ブラウザがローカル時刻と解釈しないようにする
    assert created_at.endswith("Z")
    # Z を付けた値が、実際にUTCの現在時刻になっている
    assert before <= datetime.fromisoformat(created_at) <= after


def test_create_book_with_title_only(client: TestClient):
    response = client.post("/api/books", json={"title": "書名だけの本"})

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "書名だけの本"
    assert body["isbn"] is None
    assert body["list_price"] is None


def test_list_price_at_upper_limit_is_allowed(client: TestClient):
    response = client.post(
        "/api/books", json={"title": "テスト書籍", "list_price": 10_000_000}
    )

    assert response.status_code == 201
    assert response.json()["list_price"] == 10_000_000


def test_create_book_saves_to_db(client: TestClient, session: Session):
    response = client.post("/api/books", json={"title": "テスト書籍"})

    book = session.get(Book, response.json()["id"])
    assert book is not None
    assert book.title == "テスト書籍"


def test_create_book_also_creates_unread_reading_record(
    client: TestClient, session: Session
):
    response = client.post("/api/books", json={"title": "テスト書籍"})

    record = session.scalar(
        select(ReadingRecord).where(ReadingRecord.book_id == response.json()["id"])
    )
    assert record is not None
    assert record.status == "unread"
    assert record.started_at is None
    assert record.finished_at is None


# --- 入力値の正規化 ---


def test_isbn10_with_hyphens_is_saved_as_isbn13(client: TestClient):
    response = client.post(
        "/api/books", json={"isbn": OTHER_ISBN10_WITH_HYPHENS, "title": "テスト書籍"}
    )

    assert response.status_code == 201
    assert response.json()["isbn"] == OTHER_ISBN13


def test_blank_strings_are_saved_as_null(client: TestClient):
    response = client.post(
        "/api/books",
        json={
            "isbn": "",
            "title": "テスト書籍",
            "author": "",
            "publisher": "  ",
            "published_date": "",
            "cover_image_url": "",
        },
    )

    assert response.status_code == 201
    body = response.json()
    for key in ("isbn", "author", "publisher", "published_date", "cover_image_url"):
        assert body[key] is None


def test_title_is_stripped(client: TestClient):
    response = client.post("/api/books", json={"title": "  テスト書籍  "})

    assert response.json()["title"] == "テスト書籍"


def test_books_without_isbn_can_be_created_multiple_times(client: TestClient):
    first = client.post("/api/books", json={"title": "ISBNなし1"})
    second = client.post("/api/books", json={"title": "ISBNなし2", "isbn": ""})

    assert first.status_code == 201
    assert second.status_code == 201


# --- 重複 ---


def test_duplicate_isbn_returns_409(client: TestClient, session: Session):
    client.post("/api/books", json={"isbn": ISBN13, "title": "1冊目"})
    response = client.post("/api/books", json={"isbn": ISBN13, "title": "2冊目"})

    assert response.status_code == 409
    assert session.query(Book).count() == 1


def test_same_book_as_isbn10_is_detected_as_duplicate(client: TestClient):
    client.post("/api/books", json={"isbn": ISBN13, "title": "1冊目"})
    response = client.post("/api/books", json={"isbn": ISBN10, "title": "2冊目"})

    assert response.status_code == 409


def test_duplicate_isbn_missed_by_check_returns_409(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
):
    # 重複チェックの後に別のリクエストが同じISBNを登録した場合を、
    # チェックが重複を見逃す形で再現する。DBのUNIQUE制約の違反を500にしない
    client.post("/api/books", json={"isbn": ISBN13, "title": "1冊目"})
    monkeypatch.setattr(books_router, "_ensure_isbn_available", lambda *_, **__: None)

    response = client.post("/api/books", json={"isbn": ISBN13, "title": "2冊目"})

    assert response.status_code == 409
    assert response.json()["detail"] == f"ISBN {ISBN13} の本はすでに登録されています"
    assert session.query(Book).count() == 1
    assert session.query(ReadingRecord).count() == 1


# --- 入力エラー ---


@pytest.mark.parametrize(
    "payload",
    [
        {},  # title なし
        {"title": ""},
        {"title": "   "},
        {"title": "テスト書籍", "list_price": -1},
        {"title": "テスト書籍", "list_price": 10_000_001},  # 上限超え
        {"title": "テスト書籍", "list_price": 10**20},  # SQLiteの整数の範囲外
        {"title": "テスト書籍", "isbn": ISBN13_WRONG_CHECK_DIGIT},
        {"title": "テスト書籍", "isbn": "abc"},
        {"title": "テスト書籍", "auther": "著者A"},  # 項目名の打ち間違い
        {"title": "テスト書籍", "disposed_on": "2026-10-10"},  # 書誌情報ではない
    ],
)
def test_invalid_payload_returns_422(
    client: TestClient, session: Session, payload: dict[str, object]
):
    response = client.post("/api/books", json=payload)

    assert response.status_code == 422
    assert session.query(Book).count() == 0
    assert session.query(ReadingRecord).count() == 0


def test_invalid_isbn_error_message_is_returned(client: TestClient):
    response = client.post(
        "/api/books", json={"title": "テスト書籍", "isbn": ISBN13_WRONG_CHECK_DIGIT}
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "isbn"]
    assert "番号に入力ミスがないか確認してください" in error["msg"]


def test_isbn_with_non_ascii_digits_is_rejected(client: TestClient, session: Session):
    # ISBN13 の一部の桁をアラビア・インド数字にした値。
    # ISBN13 と同じ値として重複チェックできないため、保存させない
    response = client.post(
        "/api/books", json={"title": "テスト書籍", "isbn": "978٤٠٠٣١٠١٠١8"}
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "isbn"]
    assert "番号に入力ミスがないか確認してください" in error["msg"]
    assert session.query(Book).count() == 0
