"""ISBNから書誌情報を取得するAPI GET /api/isbn-lookup のテスト

openBD はモックに差し替え、本物は呼ばない
"""

import json
import logging
from collections.abc import Callable, Iterator
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.openbd import OPENBD_API_URL, get_openbd_client

DATA_DIR = Path(__file__).resolve().parent / "data" / "openbd"

ISBN13 = "9784480683212"
ISBN10_WITH_HYPHENS = "4-480-68321-6"
FULLWIDTH_ISBN13 = "９７８４４８０６８３２１２"

Handler = Callable[[httpx.Request], httpx.Response]


class FakeOpenBD:
    """openBD のモック。返す応答を決め、受け取ったリクエストを記録する"""

    def __init__(self) -> None:
        self.handler: Handler = lambda request: httpx.Response(200, json=[None])
        self.requests: list[httpx.Request] = []

    def respond_with(self, handler: Handler) -> None:
        self.handler = handler

    def respond_json(self, body: object, status_code: int = 200) -> None:
        self.handler = lambda request: httpx.Response(status_code, json=body)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.handler(request)


@pytest.fixture
def openbd(client: TestClient) -> Iterator[FakeOpenBD]:
    """client フィクスチャの差し替えを、さらにこのモックに差し替える"""
    fake = FakeOpenBD()

    def override_get_openbd_client() -> Iterator[httpx.Client]:
        with httpx.Client(transport=httpx.MockTransport(fake)) as openbd_client:
            yield openbd_client

    app.dependency_overrides[get_openbd_client] = override_get_openbd_client
    yield fake


def load_record(isbn: str) -> object:
    return json.loads((DATA_DIR / f"{isbn}.json").read_text(encoding="utf-8"))


def error_detail(error_type: str, loc: list[str], msg: str) -> list[dict[str, object]]:
    return [{"type": error_type, "loc": loc, "msg": msg}]


LOOKUP_FAILED = error_detail(
    "lookup_failed",
    [],
    "書誌情報を取得できませんでした。時間をおいて試すか、手動で入力してください",
)


# --- 正常系 ---


def test_lookup_returns_book_info(client: TestClient, openbd: FakeOpenBD):
    openbd.respond_json([load_record(ISBN13)])

    response = client.get("/api/isbn-lookup", params={"isbn": ISBN13})

    assert response.status_code == 200
    assert response.json() == {
        "isbn": ISBN13,
        "title": "９９％の人が速くなる走り方",
        "author": "平岩時雄",
        "publisher": "筑摩書房",
        "published_date": "2018-05-08",
        "list_price": 924,
        "cover_image_url": "https://cover.openbd.jp/9784480683212.jpg",
    }


def test_lookup_returns_null_for_missing_items(client: TestClient, openbd: FakeOpenBD):
    openbd.respond_json([{"summary": {"title": "テスト書籍"}}])

    response = client.get("/api/isbn-lookup", params={"isbn": ISBN13})

    assert response.status_code == 200
    assert response.json() == {
        "isbn": ISBN13,
        "title": "テスト書籍",
        "author": None,
        "publisher": None,
        "published_date": None,
        "list_price": None,
        "cover_image_url": None,
    }


@pytest.mark.parametrize("isbn", [ISBN13, ISBN10_WITH_HYPHENS, FULLWIDTH_ISBN13])
def test_lookup_queries_openbd_with_isbn13(
    client: TestClient, openbd: FakeOpenBD, isbn: str
):
    """入力の書き方によらず、openBD にはハイフンなしのISBN-13で問い合わせる"""
    openbd.respond_json([load_record(ISBN13)])

    response = client.get("/api/isbn-lookup", params={"isbn": isbn})

    assert response.status_code == 200
    assert response.json()["isbn"] == ISBN13
    assert len(openbd.requests) == 1
    request = openbd.requests[0]
    assert str(request.url.copy_with(query=None)) == OPENBD_API_URL
    assert request.url.params["isbn"] == ISBN13


# --- 該当なし ---


def test_lookup_returns_404_when_not_found(client: TestClient, openbd: FakeOpenBD):
    openbd.respond_json([None])

    response = client.get("/api/isbn-lookup", params={"isbn": ISBN13})

    assert response.status_code == 404
    assert response.json()["detail"] == error_detail(
        "not_found",
        ["query", "isbn"],
        "このISBNの本は見つかりませんでした。書誌情報を手動で入力してください",
    )


# --- 入力エラー ---


@pytest.mark.parametrize(
    ("params", "error_type", "msg"),
    [
        ({}, "missing", "ISBNを入力してください"),
        ({"isbn": ""}, "value_error", "ISBNを入力してください"),
        ({"isbn": "  "}, "value_error", "ISBNを入力してください"),
        (
            {"isbn": "9784480683213"},  # チェックディジットの誤り
            "value_error",
            "ISBNが正しくありません。番号に入力ミスがないか確認してください",
        ),
        (
            {"isbn": "abc"},
            "value_error",
            "ISBNが正しくありません。番号に入力ミスがないか確認してください",
        ),
    ],
)
def test_lookup_rejects_invalid_isbn_without_calling_openbd(
    client: TestClient,
    openbd: FakeOpenBD,
    params: dict[str, str],
    error_type: str,
    msg: str,
):
    response = client.get("/api/isbn-lookup", params=params)

    assert response.status_code == 422
    [detail] = response.json()["detail"]
    assert detail["type"] == error_type
    assert detail["loc"] == ["query", "isbn"]
    assert detail["msg"] == msg
    assert openbd.requests == []


# --- openBD の失敗 ---


def test_lookup_returns_504_on_timeout(
    client: TestClient, openbd: FakeOpenBD, caplog: pytest.LogCaptureFixture
):
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    openbd.respond_with(timeout)

    with caplog.at_level(logging.WARNING):
        response = client.get("/api/isbn-lookup", params={"isbn": ISBN13})

    assert response.status_code == 504
    assert response.json()["detail"] == error_detail(
        "lookup_timeout",
        [],
        "書誌情報の取得に時間がかかったため中断しました。"
        "時間をおいて試すか、手動で入力してください",
    )
    assert ISBN13 in caplog.text


def connect_error(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("connection refused", request=request)


@pytest.mark.parametrize(
    "handler",
    [
        pytest.param(connect_error, id="接続できない"),
        pytest.param(lambda request: httpx.Response(500), id="500"),
        pytest.param(lambda request: httpx.Response(404), id="404"),
        pytest.param(
            lambda request: httpx.Response(200, text="<html></html>"), id="JSONでない"
        ),
        pytest.param(lambda request: httpx.Response(200, json=[]), id="空の配列"),
        pytest.param(
            lambda request: httpx.Response(200, json=[None, None]), id="要素が2つ"
        ),
        pytest.param(lambda request: httpx.Response(200, json={}), id="オブジェクト"),
        pytest.param(
            lambda request: httpx.Response(200, json=[{"summary": []}]),
            id="要素の形が違う",
        ),
    ],
)
def test_lookup_returns_502_when_openbd_fails(
    client: TestClient,
    openbd: FakeOpenBD,
    caplog: pytest.LogCaptureFixture,
    handler: Handler,
):
    openbd.respond_with(handler)

    with caplog.at_level(logging.WARNING):
        response = client.get("/api/isbn-lookup", params={"isbn": ISBN13})

    assert response.status_code == 502
    assert response.json()["detail"] == LOOKUP_FAILED
    # 画面には出さない原因を、調べられるようログに残す
    assert ISBN13 in caplog.text


# --- テストの安全策 ---


def test_client_fixture_blocks_real_openbd(client: TestClient):
    """openbd フィクスチャを使わないテストからは、openBD を呼べない（conftest.py）"""
    with pytest.raises(AssertionError, match="本物の openBD"):
        client.get("/api/isbn-lookup", params={"isbn": ISBN13})
