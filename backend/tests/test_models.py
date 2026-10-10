from datetime import date

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Book, Purchase, ReadingRecord

INITIAL_REVISION = "083cd060d880"
TABLES = ("books", "purchases", "reading_records")


def add_book(session: Session, **kwargs: object) -> Book:
    book = Book(title="テスト書籍", **kwargs)
    session.add(book)
    session.commit()
    return book


def add_book_with_records(session: Session) -> Book:
    """購入記録と読書記録が付いた本を追加する"""
    book = add_book(session)
    session.add(Purchase(book_id=book.id, purchased_on=date(2026, 10, 1), amount=1000))
    session.add(ReadingRecord(book_id=book.id, status="reading"))
    session.commit()
    return book


def insert_rows_with_sql(engine: Engine) -> None:
    """マイグレーション途中のスキーマにも入れられるよう、モデルを使わずSQLで入れる"""
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO books (id, title) VALUES (1, 'テスト書籍')")
        )
        connection.execute(
            text(
                "INSERT INTO purchases (book_id, purchased_on, amount)"
                " VALUES (1, '2026-10-01', 1000)"
            )
        )
        connection.execute(
            text("INSERT INTO reading_records (book_id, status) VALUES (1, 'reading')")
        )


def count_rows(engine: Engine) -> dict[str, int]:
    with engine.connect() as connection:
        return {
            table: connection.execute(
                text(f"SELECT COUNT(*) FROM {table}")
            ).scalar_one()
            for table in TABLES
        }


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


def test_upgrade_keeps_existing_data(db_url: str, alembic_config: Config):
    command.upgrade(alembic_config, INITIAL_REVISION)
    engine = create_engine(db_url)
    insert_rows_with_sql(engine)

    command.upgrade(alembic_config, "head")

    counts = count_rows(engine)
    engine.dispose()
    assert counts == {"books": 1, "purchases": 1, "reading_records": 1}


def test_downgrade_keeps_existing_data(db_url: str, alembic_config: Config):
    # books を作り直すときに CASCADE で子の行が消えないことを確かめる
    command.upgrade(alembic_config, "head")
    engine = create_engine(db_url)
    insert_rows_with_sql(engine)

    command.downgrade(alembic_config, INITIAL_REVISION)

    counts = count_rows(engine)
    engine.dispose()
    assert counts == {"books": 1, "purchases": 1, "reading_records": 1}


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


def test_disposed_on_is_null_by_default(session: Session):
    book = add_book(session)

    assert book.disposed_on is None


def test_disposed_on_can_be_saved(session: Session):
    book = add_book(session, disposed_on=date(2026, 10, 10))
    session.expire_all()

    saved = session.get(Book, book.id)
    assert saved is not None
    assert saved.disposed_on == date(2026, 10, 10)


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


def test_deleting_book_also_deletes_purchases(session: Session):
    book = add_book_with_records(session)

    session.delete(book)
    session.commit()

    assert session.scalar(select(func.count()).select_from(Purchase)) == 0


def test_deleting_book_keeps_records_of_other_books(session: Session):
    book = add_book_with_records(session)
    other = add_book_with_records(session)

    session.delete(book)
    session.commit()

    assert session.scalars(select(Purchase.book_id)).all() == [other.id]
    assert session.scalars(select(ReadingRecord.book_id)).all() == [other.id]


# --- reading_records ---


def test_invalid_status_is_rejected(session: Session):
    book = add_book(session)
    session.add(ReadingRecord(book_id=book.id, status="done"))

    with pytest.raises(IntegrityError):
        session.commit()


def test_deleting_book_also_deletes_reading_record(session: Session):
    book = add_book_with_records(session)

    session.delete(book)
    session.commit()

    assert session.scalar(select(func.count()).select_from(ReadingRecord)) == 0


def test_second_reading_record_for_same_book_is_rejected(session: Session):
    book = add_book(session)
    session.add(ReadingRecord(book_id=book.id, status="unread"))
    session.commit()

    session.add(ReadingRecord(book_id=book.id, status="reading"))
    with pytest.raises(IntegrityError):
        session.commit()
