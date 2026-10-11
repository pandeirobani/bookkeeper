"""書籍の登録・更新での表紙画像のURL（cover_image_url）の検証のテスト"""

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Book

ORIGINAL_URL = "https://example.com/original.jpg"

FORMAT_ERROR = "表紙画像のURLは http:// または https:// で始まるURLを入力してください"
LENGTH_ERROR = "表紙画像のURLは2000文字以内で入力してください"


def url_of_length(length: int) -> str:
    prefix = "https://example.com/"
    return prefix + "a" * (length - len(prefix))


def save_book(
    client: TestClient, method: str, cover_image_url: str
) -> tuple[httpx.Response, int | None]:
    """登録（POST）か更新（PUT）で書籍を保存し、レスポンスと本のIDを返す。

    登録に失敗した場合、本のIDは None。
    更新の場合は、更新前のURLを ORIGINAL_URL にしておく
    """
    payload = {"title": "テスト書籍", "cover_image_url": cover_image_url}
    if method == "POST":
        response = client.post("/api/books", json=payload)
        book_id = response.json()["id"] if response.status_code == 201 else None
        return response, book_id

    created = client.post(
        "/api/books", json={"title": "テスト書籍", "cover_image_url": ORIGINAL_URL}
    ).json()
    response = client.put(f"/api/books/{created['id']}", json=payload)
    return response, created["id"]


def saved_url(session: Session, book_id: int | None) -> str | None:
    book = session.get(Book, book_id)
    assert book is not None
    return book.cover_image_url


@pytest.fixture(params=["POST", "PUT"])
def method(request: pytest.FixtureRequest) -> str:
    return request.param


# --- 正常系 ---


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/cover.jpg",
        "https://example.com/cover.jpg",
        "HTTPS://example.com/cover.jpg",  # スキームの大文字・小文字は区別しない
        "https://example.com:8080/cover.jpg?size=L#top",
        "http://127.0.0.1/cover.jpg",
        url_of_length(2000),  # 上限ちょうど
    ],
)
def test_valid_url_is_saved_as_is(
    client: TestClient, session: Session, method: str, url: str
):
    response, book_id = save_book(client, method, url)

    assert response.status_code in (200, 201)
    assert response.json()["cover_image_url"] == url
    assert saved_url(session, book_id) == url


@pytest.mark.parametrize("padding", [" ", "　"])  # 半角と全角の空白
def test_surrounding_whitespace_is_removed(
    client: TestClient, session: Session, method: str, padding: str
):
    url = "https://example.com/cover.jpg"

    response, book_id = save_book(client, method, padding + url + padding)

    assert response.status_code in (200, 201)
    assert saved_url(session, book_id) == url


@pytest.mark.parametrize("blank", ["", "   "])
def test_blank_is_saved_as_null(
    client: TestClient, session: Session, method: str, blank: str
):
    response, book_id = save_book(client, method, blank)

    assert response.status_code in (200, 201)
    assert saved_url(session, book_id) is None


# --- 入力エラー ---


@pytest.mark.parametrize(
    ("url", "message"),
    [
        ("javascript:alert(1)", FORMAT_ERROR),
        ("data:image/png;base64,iVBORw0KGgo=", FORMAT_ERROR),
        ("ftp://example.com/cover.jpg", FORMAT_ERROR),
        ("example.com/cover.jpg", FORMAT_ERROR),  # スキームがない
        ("//example.com/cover.jpg", FORMAT_ERROR),  # スキームがない
        ("https://", FORMAT_ERROR),  # ホスト名がない
        ("https:///cover.jpg", FORMAT_ERROR),  # ホスト名がない
        ("http://[::1/cover.jpg", FORMAT_ERROR),  # URLとして解釈できない
        (url_of_length(2001), LENGTH_ERROR),  # 上限超え
    ],
)
def test_invalid_url_returns_422(
    client: TestClient, session: Session, method: str, url: str, message: str
):
    response, book_id = save_book(client, method, url)

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "cover_image_url"]
    assert message in error["msg"]
    if method == "POST":
        assert session.query(Book).count() == 0
    else:
        assert saved_url(session, book_id) == ORIGINAL_URL
