"""書籍の登録・更新での書誌情報の文字数の上限のテスト"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Book

MAX_LENGTHS = {
    "title": 200,
    "author": 100,
    "publisher": 100,
    "published_date": 100,
}

FIELDS = list(MAX_LENGTHS)


def save_book(
    client: TestClient, method: str, fields: dict[str, str]
) -> tuple[int, int | None]:
    """登録（POST）か更新（PUT）で書籍を保存し、ステータスコードと本のIDを返す。
    登録に失敗した場合、本のIDは None
    """
    payload = {"title": "テスト書籍", **fields}
    if method == "POST":
        response = client.post("/api/books", json=payload)
        book_id = response.json()["id"] if response.status_code == 201 else None
        return response.status_code, book_id

    created = client.post("/api/books", json={"title": "更新前の書名"}).json()
    response = client.put(f"/api/books/{created['id']}", json=payload)
    return response.status_code, created["id"]


@pytest.fixture(params=["POST", "PUT"])
def method(request: pytest.FixtureRequest) -> str:
    return request.param


@pytest.mark.parametrize("field", FIELDS)
def test_value_at_max_length_is_saved(
    client: TestClient, session: Session, method: str, field: str
):
    value = "あ" * MAX_LENGTHS[field]

    status_code, book_id = save_book(client, method, {field: value})

    assert status_code in (200, 201)
    book = session.get(Book, book_id)
    assert book is not None
    assert getattr(book, field) == value


@pytest.mark.parametrize("field", FIELDS)
def test_value_over_max_length_returns_422(
    client: TestClient, session: Session, method: str, field: str
):
    status_code, book_id = save_book(
        client, method, {field: "あ" * (MAX_LENGTHS[field] + 1)}
    )

    assert status_code == 422
    if method == "POST":
        assert session.query(Book).count() == 0
    else:
        book = session.get(Book, book_id)
        assert book is not None
        assert book.title == "更新前の書名"


@pytest.mark.parametrize("field", FIELDS)
@pytest.mark.parametrize("padding", [" ", "　"])  # 半角と全角の空白
def test_length_is_checked_after_stripping_whitespace(
    client: TestClient, session: Session, method: str, field: str, padding: str
):
    # 前後の空白を除けば上限ちょうどなので保存できる
    value = "あ" * MAX_LENGTHS[field]

    status_code, book_id = save_book(
        client, method, {field: padding * 3 + value + padding * 3}
    )

    assert status_code in (200, 201)
    book = session.get(Book, book_id)
    assert book is not None
    assert getattr(book, field) == value


@pytest.mark.parametrize(
    ("field", "message"),
    [
        ("title", "書名は200文字以内で入力してください"),
        ("author", "著者は100文字以内で入力してください"),
        ("publisher", "出版社は100文字以内で入力してください"),
        ("published_date", "出版日は100文字以内で入力してください"),
    ],
)
def test_error_message_is_in_japanese(
    client: TestClient, method: str, field: str, message: str
):
    payload = {"title": "テスト書籍", field: "あ" * (MAX_LENGTHS[field] + 1)}
    if method == "POST":
        response = client.post("/api/books", json=payload)
    else:
        created = client.post("/api/books", json={"title": "更新前の書名"}).json()
        response = client.put(f"/api/books/{created['id']}", json=payload)

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", field]
    assert message in error["msg"]
