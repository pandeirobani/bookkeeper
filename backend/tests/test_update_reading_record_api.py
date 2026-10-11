"""読書記録更新API PUT /api/books/{book_id}/reading-record のテスト"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Purchase, ReadingRecord

ALL_FIELDS = {
    "status": "finished",
    "started_at": "2026-09-01",
    "finished_at": "2026-10-10",
    "memo": "読書メモ",
}


def create_book(client: TestClient) -> int:
    response = client.post("/api/books", json={"title": "テスト書籍"})
    assert response.status_code == 201
    return response.json()["id"]


def get_record(session: Session, book_id: int) -> ReadingRecord:
    record = session.scalar(
        select(ReadingRecord).where(ReadingRecord.book_id == book_id)
    )
    assert record is not None
    session.refresh(record)
    return record


# --- 正常系 ---


def test_update_reading_record_replaces_all_fields(
    client: TestClient, session: Session
):
    book_id = create_book(client)

    response = client.put(f"/api/books/{book_id}/reading-record", json=ALL_FIELDS)

    assert response.status_code == 200
    assert response.json() == {
        "id": get_record(session, book_id).id,
        "book_id": book_id,
        **ALL_FIELDS,
    }


def test_update_reading_record_saves_to_db(client: TestClient, session: Session):
    book_id = create_book(client)

    client.put(f"/api/books/{book_id}/reading-record", json=ALL_FIELDS)

    record = get_record(session, book_id)
    assert record.status == "finished"
    assert record.started_at == date(2026, 9, 1)
    assert record.finished_at == date(2026, 10, 10)
    assert record.memo == "読書メモ"


def test_omitted_fields_become_null(client: TestClient):
    book_id = create_book(client)
    client.put(f"/api/books/{book_id}/reading-record", json=ALL_FIELDS)

    response = client.put(
        f"/api/books/{book_id}/reading-record", json={"status": "reading"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "reading"
    for key in ("started_at", "finished_at", "memo"):
        assert body[key] is None


def test_dates_are_not_filled_automatically(client: TestClient):
    # 状態を変えても、日付は送られた値のまま保存する
    book_id = create_book(client)

    body = client.put(
        f"/api/books/{book_id}/reading-record", json={"status": "finished"}
    ).json()

    assert body["started_at"] is None
    assert body["finished_at"] is None


@pytest.mark.parametrize("memo", ["", "   "])
def test_blank_memo_is_saved_as_null(client: TestClient, memo: str):
    book_id = create_book(client)

    response = client.put(
        f"/api/books/{book_id}/reading-record",
        json={"status": "reading", "memo": memo},
    )

    assert response.status_code == 200
    assert response.json()["memo"] is None


def test_memo_is_stripped(client: TestClient):
    book_id = create_book(client)

    response = client.put(
        f"/api/books/{book_id}/reading-record",
        json={"status": "reading", "memo": "  読書メモ  "},
    )

    assert response.json()["memo"] == "読書メモ"


def test_same_started_and_finished_date_is_allowed(client: TestClient):
    book_id = create_book(client)

    response = client.put(
        f"/api/books/{book_id}/reading-record",
        json={
            "status": "finished",
            "started_at": "2026-10-10",
            "finished_at": "2026-10-10",
        },
    )

    assert response.status_code == 200


@pytest.mark.parametrize(
    "dates",
    [
        {"started_at": "2026-10-10"},
        {"finished_at": "2026-10-10"},
    ],
)
def test_only_one_date_is_allowed(client: TestClient, dates: dict[str, str]):
    book_id = create_book(client)

    response = client.put(
        f"/api/books/{book_id}/reading-record", json={"status": "finished", **dates}
    )

    assert response.status_code == 200


def test_status_and_dates_are_not_checked_for_consistency(client: TestClient):
    # 状態と日付の組み合わせはチェックしない
    book_id = create_book(client)

    response = client.put(
        f"/api/books/{book_id}/reading-record",
        json={"status": "unread", "started_at": "2026-10-10"},
    )

    assert response.status_code == 200


def test_update_reading_record_does_not_change_book_or_purchases(
    client: TestClient, session: Session
):
    book_id = create_book(client)
    client.post(
        f"/api/books/{book_id}/purchases",
        json={"purchased_on": "2026-01-01", "amount": 1500},
    )
    book_before = client.get(f"/api/books/{book_id}").json()

    client.put(f"/api/books/{book_id}/reading-record", json=ALL_FIELDS)

    assert client.get(f"/api/books/{book_id}").json() == book_before
    purchases = session.scalars(
        select(Purchase).where(Purchase.book_id == book_id)
    ).all()
    assert [p.amount for p in purchases] == [1500]


# --- エラー ---


def test_book_not_found_returns_404(client: TestClient):
    response = client.put("/api/books/999/reading-record", json=ALL_FIELDS)

    assert response.status_code == 404
    assert response.json()["detail"] == "ID 999 の本は見つかりません"


def test_non_integer_id_returns_422(client: TestClient):
    response = client.put("/api/books/abc/reading-record", json=ALL_FIELDS)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {},  # status なし
        {"status": None},
        {"status": ""},
        {"status": "done"},
        {"status": "reading", "started_at": "2026/10/01"},
        {"status": "finished", "finished_at": "abc"},
        # 読了日が開始日より前
        {"status": "finished", "started_at": "2026-10-10", "finished_at": "2026-10-09"},
    ],
)
def test_invalid_payload_returns_422(
    client: TestClient, session: Session, payload: dict[str, object]
):
    book_id = create_book(client)
    client.put(f"/api/books/{book_id}/reading-record", json=ALL_FIELDS)

    response = client.put(f"/api/books/{book_id}/reading-record", json=payload)

    assert response.status_code == 422
    record = get_record(session, book_id)
    assert record.status == "finished"
    assert record.started_at == date(2026, 9, 1)
    assert record.finished_at == date(2026, 10, 10)
    assert record.memo == "読書メモ"


def test_finished_before_started_returns_error_message(client: TestClient):
    book_id = create_book(client)

    response = client.put(
        f"/api/books/{book_id}/reading-record",
        json={
            "status": "finished",
            "started_at": "2026-10-10",
            "finished_at": "2026-10-09",
        },
    )

    assert response.status_code == 422
    assert "読了日は開始日以降の日付にしてください" in response.text
