"""本の詳細（app/services/books.py の get_book_detail）のテスト"""

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.models import Book, Purchase, ReadingRecord
from app.services.books import BookNotFoundError, get_book_detail


def add_book(session: Session, **fields: object) -> Book:
    book = Book(title="本", **fields)
    session.add(book)
    session.flush()
    return book


def test_returns_bibliographic_info_reading_record_and_purchases(
    session: Session,
) -> None:
    book = add_book(
        session,
        isbn="9784000000000",
        author="著者",
        publisher="出版社",
        published_date="2020-01",
        list_price=2000,
        disposed_on=date(2026, 5, 1),
    )
    session.add(
        ReadingRecord(
            book_id=book.id,
            status="finished",
            started_at=date(2026, 2, 1),
            finished_at=date(2026, 3, 1),
            memo="面白かった",
        )
    )
    session.add(
        Purchase(
            book_id=book.id,
            purchased_on=date(2026, 1, 15),
            amount=1980,
            store="書店",
            memo="新品",
        )
    )
    session.commit()

    detail = get_book_detail(session, book.id)

    assert detail.model_dump() == {
        "id": book.id,
        "isbn": "9784000000000",
        "title": "本",
        "author": "著者",
        "publisher": "出版社",
        "published_date": "2020-01",
        "list_price": 2000,
        "disposed_on": date(2026, 5, 1),
        "reading": {
            "status": "finished",
            "started_at": date(2026, 2, 1),
            "finished_at": date(2026, 3, 1),
            "memo": "面白かった",
        },
        "purchases": [
            {
                "purchased_on": date(2026, 1, 15),
                "amount": 1980,
                "store": "書店",
                "memo": "新品",
            }
        ],
        "purchase_total": 1980,
    }


def test_purchases_are_oldest_first_and_summed(session: Session) -> None:
    book = add_book(session)
    session.add(Purchase(book_id=book.id, purchased_on=date(2026, 3, 1), amount=500))
    session.add(Purchase(book_id=book.id, purchased_on=date(2026, 1, 1), amount=1000))
    # ほかの本の購入記録は含めない
    other = add_book(session)
    session.add(Purchase(book_id=other.id, purchased_on=date(2026, 2, 1), amount=300))
    session.commit()

    detail = get_book_detail(session, book.id)

    assert [p.purchased_on for p in detail.purchases] == [
        date(2026, 1, 1),
        date(2026, 3, 1),
    ]
    assert detail.purchase_total == 1500


def test_book_without_records(session: Session) -> None:
    book = add_book(session)
    session.commit()

    detail = get_book_detail(session, book.id)

    assert detail.reading is None
    assert detail.purchases == []
    assert detail.purchase_total == 0


def test_raises_when_book_does_not_exist(session: Session) -> None:
    with pytest.raises(BookNotFoundError) as excinfo:
        get_book_detail(session, 999)

    assert excinfo.value.book_id == 999
