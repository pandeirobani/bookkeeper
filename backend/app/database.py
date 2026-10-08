import os
import sqlite3
from pathlib import Path

from sqlalchemy import Engine, MetaData, Text, create_engine, event
from sqlalchemy.engine.interfaces import DBAPIConnection
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import ConnectionPoolEntry

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parent.parent / "bookkeeper.db"

# SQLiteのALTER TABLE（batch操作）で制約を扱えるよう、制約名を固定する
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def get_database_url() -> str:
    """環境変数 DATABASE_URL があればそれを、なければ backend/bookkeeper.db を使う"""
    return os.environ.get("DATABASE_URL", f"sqlite:///{DEFAULT_DATABASE_PATH}")


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {str: Text}


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(
    dbapi_connection: DBAPIConnection, _connection_record: ConnectionPoolEntry
) -> None:
    """SQLiteは接続ごとに有効化しないと外部キー制約が効かない"""
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


engine = create_engine(get_database_url())
SessionLocal = sessionmaker(bind=engine)
