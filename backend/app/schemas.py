"""APIの入出力スキーマ

リクエストは extra="forbid" で知らない項目を422にする。
PUTは丸ごと置き換えるので、項目名の打ち間違いを黙って無視すると値が消えるため。
"""

from datetime import date, datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.isbn import normalize_isbn


def _blank_to_none(value: str | None) -> str | None:
    """前後の空白を取り除き、空文字はNULLにする"""
    if value is None:
        return None
    value = value.strip()
    return value or None


class BookCreate(BaseModel):
    """書籍登録のリクエスト"""

    model_config = ConfigDict(extra="forbid")

    isbn: str | None = None
    title: str
    author: str | None = None
    publisher: str | None = None
    published_date: str | None = None
    list_price: int | None = Field(default=None, ge=0)
    cover_image_url: str | None = None

    @field_validator("isbn")
    @classmethod
    def _normalize_isbn(cls, value: str | None) -> str | None:
        # InvalidIsbnError は ValueError のサブクラスなので 422 になる
        return normalize_isbn(value)

    @field_validator("title")
    @classmethod
    def _title_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if value == "":
            raise ValueError("書名を入力してください")
        return value

    @field_validator("author", "publisher", "published_date", "cover_image_url")
    @classmethod
    def _normalize_blank(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class BookDisposalUpdate(BaseModel):
    """手放した日の設定・解除のリクエスト。NULLで手元に戻す"""

    model_config = ConfigDict(extra="forbid")

    # 送り忘れで手元に戻ってしまわないよう、NULLでも省略は許さない
    disposed_on: date | None


class BookResponse(BaseModel):
    """書籍のレスポンス"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    isbn: str | None
    title: str
    author: str | None
    publisher: str | None
    published_date: str | None
    list_price: int | None
    cover_image_url: str | None
    disposed_on: date | None
    created_at: datetime


class PurchaseCreate(BaseModel):
    """購入記録の追加・更新のリクエスト"""

    model_config = ConfigDict(extra="forbid")

    purchased_on: date
    amount: int = Field(ge=0)
    store: str | None = None
    memo: str | None = None

    @field_validator("store", "memo")
    @classmethod
    def _normalize_blank(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class PurchaseResponse(BaseModel):
    """購入記録のレスポンス"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    book_id: int
    purchased_on: date
    amount: int
    store: str | None
    memo: str | None
    created_at: datetime


class ReadingRecordUpdate(BaseModel):
    """読書記録の更新のリクエスト"""

    model_config = ConfigDict(extra="forbid")

    # 日付は覚えていないこともあるので、状態との組み合わせはチェックしない
    status: Literal["unread", "reading", "finished"]
    started_at: date | None = None
    finished_at: date | None = None
    memo: str | None = None

    @field_validator("memo")
    @classmethod
    def _normalize_blank(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @model_validator(mode="after")
    def _finished_at_must_not_be_before_started_at(self) -> Self:
        if (
            self.started_at is not None
            and self.finished_at is not None
            and self.finished_at < self.started_at
        ):
            raise ValueError("読了日は開始日以降の日付にしてください")
        return self


class ReadingRecordResponse(BaseModel):
    """読書記録のレスポンス"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    book_id: int
    status: Literal["unread", "reading", "finished"]
    started_at: date | None
    finished_at: date | None
    memo: str | None
