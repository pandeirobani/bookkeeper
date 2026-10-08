"""テーブル定義。docs/db-design.md に従う"""

from datetime import date, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Book(Base):
    """書誌情報"""

    __tablename__ = "books"
    __table_args__ = (
        CheckConstraint("list_price >= 0", name="list_price_non_negative"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # ISBN-13で統一して保存。ISBNのない本はNULL
    isbn: Mapped[str | None] = mapped_column(unique=True)
    title: Mapped[str]
    # 複数著者はカンマ区切り
    author: Mapped[str | None]
    publisher: Mapped[str | None]
    # API側の形式がまちまちなので文字列
    published_date: Mapped[str | None]
    # 定価（税込・円）。書籍費の集計には使わない
    list_price: Mapped[int | None]
    cover_image_url: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )


class Purchase(Base):
    """購入記録"""

    __tablename__ = "purchases"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="amount_non_negative"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # 購入記録がある本は削除できない
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="RESTRICT"), index=True
    )
    purchased_on: Mapped[date] = mapped_column(index=True)
    # 実際に支払った金額（税込・円）
    amount: Mapped[int]
    store: Mapped[str | None]
    memo: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )


class ReadingRecord(Base):
    """読書記録（1冊につき1記録）"""

    __tablename__ = "reading_records"
    __table_args__ = (
        CheckConstraint(
            "status IN ('unread', 'reading', 'finished')", name="status_valid"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id"), unique=True)
    status: Mapped[str]
    started_at: Mapped[date | None]
    finished_at: Mapped[date | None]
    memo: Mapped[str | None]
