"""FastAPI・Starletteが出すエラー（存在しないURLなど）の形のテスト

アプリが出すエラーや入力エラーと同じく、detail を配列の形で返すことを確かめる
"""

import asyncio
import json

from fastapi import HTTPException, Request
from fastapi.testclient import TestClient

from app.errors import http_exception_handler


def test_unknown_url_returns_404_in_japanese(client: TestClient):
    response = client.get("/api/unknown")

    assert response.status_code == 404
    assert response.json()["detail"] == [
        {"type": "http_error", "loc": [], "msg": "指定したURLは見つかりません"}
    ]


def test_method_not_allowed_returns_405_in_japanese(client: TestClient):
    response = client.patch("/api/health")

    assert response.status_code == 405
    assert response.json()["detail"] == [
        {
            "type": "http_error",
            "loc": [],
            "msg": "このURLでは、このメソッドは使えません",
        }
    ]
    # 使えるメソッドを示す Allow ヘッダーは残す
    assert response.headers["allow"] == "GET"


def test_other_string_detail_is_wrapped_as_is():
    # 対応表にないステータスのエラーは、メッセージをそのまま配列に包む
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": []})
    exc = HTTPException(status_code=400, detail="不正なリクエストです")

    response = asyncio.run(http_exception_handler(request, exc))

    assert response.status_code == 400
    assert json.loads(response.body) == {
        "detail": [{"type": "http_error", "loc": [], "msg": "不正なリクエストです"}]
    }
