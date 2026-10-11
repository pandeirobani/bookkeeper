"""パスのID（book_id・purchase_id）の範囲のテスト

SQLiteの整数の範囲を超えるIDは、DBを検索する前に422にする
"""

import pytest
from fastapi.testclient import TestClient

from app.routers.books import SQLITE_MAX_INTEGER

ENDPOINTS = [
    ("GET", "/api/books/{id}", None),
    ("PUT", "/api/books/{id}", {"title": "テスト書籍"}),
    ("DELETE", "/api/books/{id}", None),
    ("PUT", "/api/books/{id}/disposal", {"disposed_on": "2026-10-10"}),
    ("GET", "/api/books/{id}/purchases", None),
    (
        "POST",
        "/api/books/{id}/purchases",
        {"purchased_on": "2026-10-01", "amount": 1980},
    ),
    (
        "PUT",
        "/api/purchases/{id}",
        {"purchased_on": "2026-10-01", "amount": 1980},
    ),
    ("DELETE", "/api/purchases/{id}", None),
    ("GET", "/api/books/{id}/reading-record", None),
    ("PUT", "/api/books/{id}/reading-record", {"status": "reading"}),
]


@pytest.mark.parametrize(("method", "path", "payload"), ENDPOINTS)
def test_id_beyond_sqlite_integer_returns_422(
    client: TestClient, method: str, path: str, payload: dict[str, object] | None
):
    response = client.request(
        method, path.format(id=SQLITE_MAX_INTEGER + 1), json=payload
    )

    assert response.status_code == 422


@pytest.mark.parametrize(("method", "path", "payload"), ENDPOINTS)
def test_max_sqlite_integer_id_returns_404(
    client: TestClient, method: str, path: str, payload: dict[str, object] | None
):
    response = client.request(method, path.format(id=SQLITE_MAX_INTEGER), json=payload)

    assert response.status_code == 404
