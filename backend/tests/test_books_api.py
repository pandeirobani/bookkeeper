from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from app.database import get_session
from app.main import app
from app.models import Book, ReadingRecord


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    """DBを一時DBに差し替えたテストクライアント"""

    def override_get_session() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    yield TestClient(app)
    app.dependency_overrides.clear()


# --- 正常系 ---


def test_create_book_with_all_fields(client: TestClient):
    response = client.post(
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
    )

    assert response.status_code == 201
    body = response.json()
    assert isinstance(body["id"], int)
    assert body["created_at"] is not None
    assert {k: v for k, v in body.items() if k not in ("id", "created_at")} == {
        "isbn": "9784003101018",
        "title": "テスト書籍",
        "author": "著者A,著者B",
        "publisher": "テスト出版",
        "published_date": "2024-05",
        "list_price": 1980,
        "cover_image_url": "https://example.com/cover.jpg",
    }


def test_create_book_with_title_only(client: TestClient):
    response = client.post("/api/books", json={"title": "書名だけの本"})

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "書名だけの本"
    assert body["isbn"] is None
    assert body["list_price"] is None


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
        "/api/books", json={"isbn": "4-87311-778-X", "title": "テスト書籍"}
    )

    assert response.status_code == 201
    assert response.json()["isbn"] == "9784873117782"


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
    client.post("/api/books", json={"isbn": "9784003101018", "title": "1冊目"})
    response = client.post(
        "/api/books", json={"isbn": "9784003101018", "title": "2冊目"}
    )

    assert response.status_code == 409
    assert session.query(Book).count() == 1


def test_same_book_as_isbn10_is_detected_as_duplicate(client: TestClient):
    client.post("/api/books", json={"isbn": "9784003101018", "title": "1冊目"})
    response = client.post("/api/books", json={"isbn": "4003101014", "title": "2冊目"})

    assert response.status_code == 409


# --- 入力エラー ---


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
    response = client.post("/api/books", json=payload)

    assert response.status_code == 422
    assert session.query(Book).count() == 0
    assert session.query(ReadingRecord).count() == 0


def test_invalid_isbn_error_message_is_returned(client: TestClient):
    response = client.post(
        "/api/books", json={"title": "テスト書籍", "isbn": "9784003101019"}
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "isbn"]
    assert "番号に入力ミスがないか確認してください" in error["msg"]
