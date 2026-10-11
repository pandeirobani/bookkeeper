"""購入記録・読書記録の追加・更新での文字数の上限のテスト"""

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Purchase, ReadingRecord

# (API, 項目, 上限, メッセージで使う項目名)
CASES = [
    ("create_purchase", "store", 100, "購入店"),
    ("create_purchase", "memo", 500, "メモ"),
    ("update_purchase", "store", 100, "購入店"),
    ("update_purchase", "memo", 500, "メモ"),
    ("update_reading_record", "memo", 500, "メモ"),
]

ORIGINAL_VALUE = "元の値"


def send(
    client: TestClient, api: str, field: str, value: str
) -> tuple[httpx.Response, int | None]:
    """APIに値を送り、レスポンスと保存先のIDを返す。

    保存先のIDは、購入記録なら購入記録のID、読書記録なら本のID。
    購入記録の追加に失敗した場合は None。更新の場合は、更新前に field を
    ORIGINAL_VALUE にしておく
    """
    book_id = client.post("/api/books", json={"title": "テスト書籍"}).json()["id"]
    purchase = {"purchased_on": "2026-10-01", "amount": 1980}

    if api == "create_purchase":
        response = client.post(
            f"/api/books/{book_id}/purchases", json={**purchase, field: value}
        )
        purchase_id = response.json()["id"] if response.status_code == 201 else None
        return response, purchase_id

    if api == "update_purchase":
        created = client.post(
            f"/api/books/{book_id}/purchases",
            json={**purchase, field: ORIGINAL_VALUE},
        ).json()
        response = client.put(
            f"/api/purchases/{created['id']}", json={**purchase, field: value}
        )
        return response, created["id"]

    client.put(
        f"/api/books/{book_id}/reading-record",
        json={"status": "reading", field: ORIGINAL_VALUE},
    )
    response = client.put(
        f"/api/books/{book_id}/reading-record",
        json={"status": "reading", field: value},
    )
    return response, book_id


def saved_value(session: Session, api: str, field: str, target_id: int) -> object:
    """DBに保存されている field の値を返す"""
    if api == "update_reading_record":
        record = session.scalar(
            select(ReadingRecord).where(ReadingRecord.book_id == target_id)
        )
    else:
        record = session.get(Purchase, target_id)
    assert record is not None
    return getattr(record, field)


@pytest.mark.parametrize(("api", "field", "max_length", "label"), CASES)
def test_value_at_max_length_is_saved(
    client: TestClient,
    session: Session,
    api: str,
    field: str,
    max_length: int,
    label: str,
):
    value = "あ" * max_length

    response, target_id = send(client, api, field, value)

    assert response.status_code in (200, 201)
    assert target_id is not None
    assert saved_value(session, api, field, target_id) == value


@pytest.mark.parametrize(("api", "field", "max_length", "label"), CASES)
def test_value_over_max_length_returns_422(
    client: TestClient,
    session: Session,
    api: str,
    field: str,
    max_length: int,
    label: str,
):
    response, target_id = send(client, api, field, "あ" * (max_length + 1))

    assert response.status_code == 422
    if api == "create_purchase":
        assert session.query(Purchase).count() == 0
    else:
        assert target_id is not None
        assert saved_value(session, api, field, target_id) == ORIGINAL_VALUE


@pytest.mark.parametrize(("api", "field", "max_length", "label"), CASES)
@pytest.mark.parametrize("padding", [" ", "　"])  # 半角と全角の空白
def test_length_is_checked_after_stripping_whitespace(
    client: TestClient,
    session: Session,
    api: str,
    field: str,
    max_length: int,
    label: str,
    padding: str,
):
    # 前後の空白を除けば上限ちょうどなので保存できる
    value = "あ" * max_length

    response, target_id = send(client, api, field, padding * 3 + value + padding * 3)

    assert response.status_code in (200, 201)
    assert target_id is not None
    assert saved_value(session, api, field, target_id) == value


@pytest.mark.parametrize(("api", "field", "max_length", "label"), CASES)
def test_error_message_is_in_japanese(
    client: TestClient, api: str, field: str, max_length: int, label: str
):
    response, _ = send(client, api, field, "あ" * (max_length + 1))

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", field]
    assert f"{label}は{max_length}文字以内で入力してください" in error["msg"]
