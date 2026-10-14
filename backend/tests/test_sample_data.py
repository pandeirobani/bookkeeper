from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Book, Purchase, ReadingRecord
from app.sample_data import SAMPLE_BOOKS, SampleDataError, insert_sample_data

TODAY = date(2026, 10, 14)


def _count(session: Session, model: type[Book | Purchase | ReadingRecord]) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def test_inserts_books_reading_records_and_purchases_into_empty_db(session: Session):
    """空の DB に、本と読書記録と購入記録を入れる"""
    count = insert_sample_data(session, TODAY)

    assert count == len(SAMPLE_BOOKS) == 8
    assert _count(session, Book) == 8
    # API で登録したときと同じく、1冊に1件の読書記録がある
    assert _count(session, ReadingRecord) == 8
    assert _count(session, Purchase) == sum(
        len(sample.purchases) for sample in SAMPLE_BOOKS
    )


def test_dates_are_relative_to_today(session: Session):
    """日付は実行した日から何日前かで決める"""
    insert_sample_data(session, TODAY)

    newest = session.scalar(select(func.max(Purchase.purchased_on)))
    oldest = session.scalar(select(func.min(Purchase.purchased_on)))
    assert newest == date(2026, 9, 29)  # 15日前
    assert oldest == date(2025, 11, 18)  # 330日前


def test_refuses_db_with_existing_books(session: Session):
    """本がある DB には何も書き込まない"""
    session.add(Book(title="自分の本"))
    session.commit()

    with pytest.raises(SampleDataError):
        insert_sample_data(session, TODAY)

    session.rollback()
    assert _count(session, Book) == 1
    assert _count(session, ReadingRecord) == 0
    assert _count(session, Purchase) == 0


def test_inserted_data_is_returned_by_apis(session: Session, client: TestClient):
    """入れたデータを、一覧・積読・書籍費の API で取得できる"""
    insert_sample_data(session, date.today())

    books = client.get("/api/books").json()
    assert len(books) == 8
    assert {book["reading_status"] for book in books} == {
        "unread",
        "reading",
        "finished",
    }
    # 手放した本が1冊ある
    assert sum(book["disposed_on"] is not None for book in books) == 1

    # 積読は、未読・読書中で手元にあり、購入記録のある本
    tsundoku = client.get("/api/tsundoku").json()
    assert len(tsundoku) == 5
    # 2回買った本は、購入記録の件数が2件
    assert {row["purchase_count"] for row in tsundoku} == {1, 2}

    yearly = client.get("/api/expenses/yearly").json()
    assert sum(row["count"] for row in yearly) == _count(session, Purchase)
