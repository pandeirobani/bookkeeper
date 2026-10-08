from datetime import date

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Book, Purchase, ReadingRecord


def add_book(session: Session, **kwargs: object) -> Book:
    book = Book(title="テスト書籍", **kwargs)
    session.add(book)
    session.commit()
    return book


# --- マイグレーション ---


def test_migration_creates_tables(engine: Engine):
    table_names = set(inspect(engine).get_table_names())

    assert {"books", "purchases", "reading_records"} <= table_names


def test_migration_matches_models(engine: Engine):
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)

    assert diff == []


def test_migration_downgrade_drops_tables(db_url: str, alembic_config: Config):
    command.upgrade(alembic_config, "head")
    command.downgrade(alembic_config, "base")

    engine = create_engine(db_url)
    table_names = set(inspect(engine).get_table_names())
    engine.dispose()

    assert table_names.isdisjoint({"books", "purchases", "reading_records"})


# --- books ---


def test_book_created_at_is_set_automatically(session: Session):
    book = add_book(session, isbn="9784000000001")

    assert book.created_at is not None


def test_books_without_isbn_can_be_added(session: Session):
    add_book(session, isbn=None)
    add_book(session, isbn=None)

    assert session.query(Book).count() == 2


def test_duplicate_isbn_is_rejected(session: Session):
    add_book(session, isbn="9784000000001")

    with pytest.raises(IntegrityError):
        add_book(session, isbn="9784000000001")


def test_negative_list_price_is_rejected(session: Session):
    with pytest.raises(IntegrityError):
        add_book(session, list_price=-1)


# --- purchases ---


def test_purchase_can_be_added(session: Session):
    book = add_book(session)
    session.add(Purchase(book_id=book.id, purchased_on=date(2026, 10, 1), amount=0))
    session.commit()

    assert session.query(Purchase).count() == 1


def test_negative_amount_is_rejected(session: Session):
    book = add_book(session)
    session.add(Purchase(book_id=book.id, purchased_on=date(2026, 10, 1), amount=-1))

    with pytest.raises(IntegrityError):
        session.commit()


def test_purchase_with_unknown_book_is_rejected(session: Session):
    session.add(Purchase(book_id=999, purchased_on=date(2026, 10, 1), amount=1000))

    with pytest.raises(IntegrityError):
        session.commit()


def test_book_with_purchases_cannot_be_deleted(session: Session):
    book = add_book(session)
    session.add(Purchase(book_id=book.id, purchased_on=date(2026, 10, 1), amount=1000))
    session.commit()

    session.delete(book)
    with pytest.raises(IntegrityError):
        session.commit()


# --- reading_records ---


def test_invalid_status_is_rejected(session: Session):
    book = add_book(session)
    session.add(ReadingRecord(book_id=book.id, status="done"))

    with pytest.raises(IntegrityError):
        session.commit()


def test_second_reading_record_for_same_book_is_rejected(session: Session):
    book = add_book(session)
    session.add(ReadingRecord(book_id=book.id, status="unread"))
    session.commit()

    session.add(ReadingRecord(book_id=book.id, status="reading"))
    with pytest.raises(IntegrityError):
        session.commit()
