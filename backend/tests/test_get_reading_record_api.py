"""読書記録取得API GET /api/books/{book_id}/reading-record のテスト"""

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import ReadingRecord


def create_book(client: TestClient, title: str = "テスト書籍") -> int:
    response = client.post("/api/books", json={"title": title})
    assert response.status_code == 201
    return response.json()["id"]


def get_record(session: Session, book_id: int) -> ReadingRecord:
    record = session.scalar(
        select(ReadingRecord).where(ReadingRecord.book_id == book_id)
    )
    assert record is not None
    return record


# --- 正常系 ---


def test_get_reading_record_of_new_book(client: TestClient, session: Session):
    book_id = create_book(client)

    response = client.get(f"/api/books/{book_id}/reading-record")

    assert response.status_code == 200
    assert response.json() == {
        "id": get_record(session, book_id).id,
        "book_id": book_id,
        "status": "unread",
        "started_at": None,
        "finished_at": None,
        "memo": None,
    }


def test_get_reading_record_returns_saved_values(client: TestClient, session: Session):
    book_id = create_book(client)
    record = get_record(session, book_id)
    record.status = "finished"
    record.started_at = date(2026, 9, 1)
    record.finished_at = date(2026, 10, 10)
    record.memo = "読書メモ"
    session.commit()

    body = client.get(f"/api/books/{book_id}/reading-record").json()

    assert body["status"] == "finished"
    assert body["started_at"] == "2026-09-01"
    assert body["finished_at"] == "2026-10-10"
    assert body["memo"] == "読書メモ"


def test_get_reading_record_returns_only_specified_book(client: TestClient):
    create_book(client, "1冊目")
    second_id = create_book(client, "2冊目")
    create_book(client, "3冊目")

    body = client.get(f"/api/books/{second_id}/reading-record").json()

    assert body["book_id"] == second_id


# --- エラー ---


def test_book_not_found_returns_404(client: TestClient):
    response = client.get("/api/books/999/reading-record")

    assert response.status_code == 404
    assert response.json()["detail"] == "ID 999 の本は見つかりません"


def test_missing_reading_record_returns_404(client: TestClient, session: Session):
    # APIからは起きないが、DBを直接変更して読書記録がなくなった場合
    book_id = create_book(client)
    session.execute(delete(ReadingRecord).where(ReadingRecord.book_id == book_id))
    session.commit()

    response = client.get(f"/api/books/{book_id}/reading-record")

    assert response.status_code == 404
    assert response.json()["detail"] == f"ID {book_id} の本の読書記録は見つかりません"


def test_non_integer_id_returns_422(client: TestClient):
    response = client.get("/api/books/abc/reading-record")

    assert response.status_code == 422
