"""書籍一覧取得API GET /api/books のテスト"""

from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Book

# テストで登録する本のISBN-13
ISBN13 = "9784003101018"

# --- 正常系 ---


def test_list_books_returns_empty_list_when_no_books(client: TestClient):
    response = client.get("/api/books")

    assert response.status_code == 200
    assert response.json() == []


def test_list_books_returns_all_fields(client: TestClient):
    created = client.post(
        "/api/books",
        json={
            "isbn": ISBN13,
            "title": "テスト書籍",
            "author": "著者A,著者B",
            "publisher": "テスト出版",
            "published_date": "2024-05",
            "list_price": 1980,
            "cover_image_url": "https://example.com/cover.jpg",
        },
    ).json()

    response = client.get("/api/books")

    assert response.status_code == 200
    # 登録した本と同じ項目に、読書状態（登録時は未読）を添える
    assert response.json() == [{**created, "reading_status": "unread"}]


def test_list_books_includes_books_without_isbn(client: TestClient):
    client.post("/api/books", json={"title": "ISBNなし1"})
    client.post("/api/books", json={"title": "ISBNなし2"})

    titles = {book["title"] for book in client.get("/api/books").json()}

    assert titles == {"ISBNなし1", "ISBNなし2"}


def test_list_books_includes_disposed_books(client: TestClient, session: Session):
    # 手放した本も一覧から消さず、disposed_on 付きで返す
    session.add_all(
        [
            Book(title="手元にある本"),
            Book(title="手放した本", disposed_on=date(2026, 10, 10)),
        ]
    )
    session.commit()

    disposed_on_by_title = {
        book["title"]: book["disposed_on"] for book in client.get("/api/books").json()
    }

    assert disposed_on_by_title == {"手元にある本": None, "手放した本": "2026-10-10"}


# --- 読書状態 ---


@pytest.mark.parametrize("status", ["unread", "reading", "finished"])
def test_list_books_returns_reading_status(client: TestClient, status: str):
    book_id = client.post("/api/books", json={"title": "テスト書籍"}).json()["id"]
    response = client.put(
        f"/api/books/{book_id}/reading-record", json={"status": status}
    )
    assert response.status_code == 200

    [book] = client.get("/api/books").json()

    assert book["reading_status"] == status


def test_list_books_returns_each_books_reading_status(client: TestClient):
    unread_id = client.post("/api/books", json={"title": "未読の本"}).json()["id"]
    reading_id = client.post("/api/books", json={"title": "読書中の本"}).json()["id"]
    client.put(f"/api/books/{reading_id}/reading-record", json={"status": "reading"})

    status_by_id = {
        book["id"]: book["reading_status"] for book in client.get("/api/books").json()
    }

    assert status_by_id == {unread_id: "unread", reading_id: "reading"}


def test_list_books_includes_book_without_reading_record(
    client: TestClient, session: Session
):
    # APIを通さずに登録した本には読書記録がない
    session.add(Book(title="読書記録のない本"))
    session.commit()

    [book] = client.get("/api/books").json()

    assert book["title"] == "読書記録のない本"
    assert book["reading_status"] is None


# --- 並び順 ---


def test_list_books_orders_by_created_at_desc(client: TestClient, session: Session):
    # id の順と登録日時の順をわざと逆にする
    session.add_all(
        [
            Book(title="新しい本", created_at=datetime(2024, 1, 2)),
            Book(title="古い本", created_at=datetime(2024, 1, 1)),
        ]
    )
    session.commit()

    titles = [book["title"] for book in client.get("/api/books").json()]

    assert titles == ["新しい本", "古い本"]


def test_list_books_with_same_created_at_orders_by_id_desc(
    client: TestClient, session: Session
):
    same_time = datetime(2024, 1, 1)
    session.add_all(
        [
            Book(title="1冊目", created_at=same_time),
            Book(title="2冊目", created_at=same_time),
            Book(title="3冊目", created_at=same_time),
        ]
    )
    session.commit()

    titles = [book["title"] for book in client.get("/api/books").json()]

    assert titles == ["3冊目", "2冊目", "1冊目"]
