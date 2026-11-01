"""読書状態の更新（app/services/books.py の update_reading_status）のテスト"""

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Book, ReadingRecord
from app.services.books import (
    BookNotFoundError,
    InvalidReadingDatesError,
    ReadingRecordNotFoundError,
    update_reading_status,
)


def add_book(
    session: Session,
    started_at: date | None = None,
    finished_at: date | None = None,
    memo: str | None = None,
    with_record: bool = True,
) -> int:
    book = Book(title="本")
    session.add(book)
    session.flush()
    if with_record:
        session.add(
            ReadingRecord(
                book_id=book.id,
                status="unread",
                started_at=started_at,
                finished_at=finished_at,
                memo=memo,
            )
        )
    session.commit()
    return book.id


def get_record(session: Session, book_id: int) -> ReadingRecord:
    record = session.scalar(
        select(ReadingRecord).where(ReadingRecord.book_id == book_id)
    )
    assert record is not None
    return record


def test_updates_status_and_dates(session: Session) -> None:
    book_id = add_book(session)

    detail = update_reading_status(
        session, book_id, "finished", date(2026, 3, 1), date(2026, 3, 10)
    )

    assert detail.reading is not None
    assert detail.reading.status == "finished"
    assert detail.reading.started_at == date(2026, 3, 1)
    assert detail.reading.finished_at == date(2026, 3, 10)
    # DB にも保存されている
    session.expire_all()
    assert get_record(session, book_id).status == "finished"


def test_keeps_dates_and_memo_when_omitted(session: Session) -> None:
    book_id = add_book(session, started_at=date(2026, 3, 1), memo="ここまで面白い")

    update_reading_status(session, book_id, "finished", None, date(2026, 3, 10))

    session.expire_all()
    record = get_record(session, book_id)
    assert record.started_at == date(2026, 3, 1)
    assert record.finished_at == date(2026, 3, 10)
    assert record.memo == "ここまで面白い"


def test_rejects_finished_before_started_using_current_dates(
    session: Session,
) -> None:
    # 読み始めた日は今の値（3月10日）で比べる
    book_id = add_book(session, started_at=date(2026, 3, 10))

    with pytest.raises(InvalidReadingDatesError):
        update_reading_status(session, book_id, "finished", None, date(2026, 3, 1))

    # 何も変わっていない
    session.expire_all()
    record = get_record(session, book_id)
    assert record.status == "unread"
    assert record.finished_at is None


def test_allows_same_day(session: Session) -> None:
    book_id = add_book(session)

    detail = update_reading_status(
        session, book_id, "finished", date(2026, 3, 1), date(2026, 3, 1)
    )

    assert detail.reading is not None
    assert detail.reading.finished_at == date(2026, 3, 1)


def test_raises_when_book_does_not_exist(session: Session) -> None:
    with pytest.raises(BookNotFoundError):
        update_reading_status(session, 999, "finished", None, None)


def test_raises_when_reading_record_does_not_exist(session: Session) -> None:
    book_id = add_book(session, with_record=False)

    with pytest.raises(ReadingRecordNotFoundError):
        update_reading_status(session, book_id, "finished", None, None)
