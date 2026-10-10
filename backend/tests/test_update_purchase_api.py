"""購入記録更新API PUT /api/purchases/{purchase_id} のテスト"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Purchase

ALL_FIELDS = {
    "purchased_on": "2026-10-05",
    "amount": 2200,
    "store": "更新後の書店",
    "memo": "更新後のメモ",
}


def create_purchase(client: TestClient) -> dict[str, object]:
    book_id = client.post("/api/books", json={"title": "テスト書籍"}).json()["id"]
    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={
            "purchased_on": "2026-10-01",
            "amount": 1980,
            "store": "更新前の書店",
            "memo": "更新前のメモ",
        },
    )
    assert response.status_code == 201
    return response.json()


# --- 正常系 ---


def test_update_purchase_replaces_all_fields(client: TestClient):
    created = create_purchase(client)

    response = client.put(f"/api/purchases/{created['id']}", json=ALL_FIELDS)

    assert response.status_code == 200
    body = response.json()
    assert {
        k: v for k, v in body.items() if k not in ("id", "book_id", "created_at")
    } == ALL_FIELDS


def test_update_purchase_saves_to_db(client: TestClient, session: Session):
    created = create_purchase(client)

    client.put(f"/api/purchases/{created['id']}", json=ALL_FIELDS)

    purchase = session.get(Purchase, created["id"])
    assert purchase is not None
    assert purchase.purchased_on == date(2026, 10, 5)
    assert purchase.amount == 2200


def test_update_purchase_keeps_id_book_id_and_created_at(client: TestClient):
    created = create_purchase(client)

    body = client.put(f"/api/purchases/{created['id']}", json=ALL_FIELDS).json()

    assert body["id"] == created["id"]
    assert body["book_id"] == created["book_id"]
    assert body["created_at"] == created["created_at"]


def test_book_id_in_payload_is_ignored(client: TestClient):
    # 購入記録を別の本に付け替えることはできない
    created = create_purchase(client)
    other_id = client.post("/api/books", json={"title": "別の本"}).json()["id"]

    body = client.put(
        f"/api/purchases/{created['id']}", json={**ALL_FIELDS, "book_id": other_id}
    ).json()

    assert body["book_id"] == created["book_id"]


def test_omitted_optional_fields_become_null(client: TestClient):
    created = create_purchase(client)

    body = client.put(
        f"/api/purchases/{created['id']}",
        json={"purchased_on": "2026-10-05", "amount": 2200},
    ).json()

    assert body["store"] is None
    assert body["memo"] is None


def test_update_purchase_does_not_change_other_purchases(
    client: TestClient, session: Session
):
    target = create_purchase(client)
    other = create_purchase(client)

    client.put(f"/api/purchases/{target['id']}", json=ALL_FIELDS)

    purchase = session.get(Purchase, other["id"])
    assert purchase is not None
    assert purchase.amount == 1980
    assert purchase.store == "更新前の書店"


# --- 入力値の正規化 ---


def test_blank_strings_are_saved_as_null(client: TestClient):
    created = create_purchase(client)

    body = client.put(
        f"/api/purchases/{created['id']}",
        json={**ALL_FIELDS, "store": "", "memo": "  "},
    ).json()

    assert body["store"] is None
    assert body["memo"] is None


# --- エラー ---


def test_update_unknown_purchase_returns_404(client: TestClient):
    response = client.put("/api/purchases/999", json=ALL_FIELDS)

    assert response.status_code == 404
    assert response.json()["detail"] == "ID 999 の購入記録は見つかりません"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"amount": 2200},  # purchased_on なし
        {"purchased_on": "2026-10-05"},  # amount なし
        {"purchased_on": "2026-10-05", "amount": -1},
        {"purchased_on": "2026-13-01", "amount": 2200},
    ],
)
def test_invalid_payload_returns_422_and_keeps_purchase(
    client: TestClient, session: Session, payload: dict[str, object]
):
    created = create_purchase(client)

    response = client.put(f"/api/purchases/{created['id']}", json=payload)

    assert response.status_code == 422
    purchase = session.get(Purchase, created["id"])
    assert purchase is not None
    assert purchase.amount == 1980


def test_update_purchase_with_non_integer_id_returns_422(client: TestClient):
    response = client.put("/api/purchases/abc", json=ALL_FIELDS)

    assert response.status_code == 422
