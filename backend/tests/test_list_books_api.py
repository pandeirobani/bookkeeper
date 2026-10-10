"""書籍一覧取得API GET /api/books のテスト"""

from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Book

# --- 正常系 ---


def test_list_books_returns_empty_list_when_no_books(client: TestClient):
    response = client.get("/api/books")

    assert response.status_code == 200
    assert response.json() == []


def test_list_books_returns_all_fields(client: TestClient):
    created = client.post(
        "/api/books",
        json={
            "isbn": "9784003101018",
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
    assert response.json() == [created]


def test_list_books_includes_books_without_isbn(client: TestClient):
    client.post("/api/books", json={"title": "ISBNなし1"})
    client.post("/api/books", json={"title": "ISBNなし2"})

    titles = {book["title"] for book in client.get("/api/books").json()}

    assert titles == {"ISBNなし1", "ISBNなし2"}


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
