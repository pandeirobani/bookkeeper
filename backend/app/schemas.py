"""APIの入出力スキーマ

リクエストは extra="forbid" で知らない項目を422にする。
PUTは丸ごと置き換えるので、項目名の打ち間違いを黙って無視すると値が消えるため。
"""

from datetime import date, datetime
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.isbn import normalize_isbn

# 金額（円）の上限。SQLiteの整数の範囲を超えて500になるのを防ぐため、
# 高価な古書なども記録できる程度に余裕を持たせて決めた
MAX_PRICE = 10_000_000

# 書誌情報の文字数の上限
MAX_TITLE_LENGTH = 200
MAX_AUTHOR_LENGTH = 100
MAX_PUBLISHER_LENGTH = 100
MAX_PUBLISHED_DATE_LENGTH = 100
# ブラウザやサーバーが一般的に扱えるURLの長さに合わせた
MAX_COVER_IMAGE_URL_LENGTH = 2000

# 購入記録・読書記録の文字数の上限。メモは購入記録と読書記録で共通
MAX_STORE_LENGTH = 100
MAX_MEMO_LENGTH = 500


def _blank_to_none(value: str | None) -> str | None:
    """前後の空白を取り除き、空文字はNULLにする"""
    if value is None:
        return None
    value = value.strip()
    return value or None


def _check_max_length(value: str | None, max_length: int, label: str) -> str | None:
    """文字数が上限を超えていれば日本語のメッセージで422にする。

    Field(max_length=...) は英語の固定メッセージになるので、自前で検証する。
    保存する値で判定するよう、前後の空白を取り除いた後に呼ぶ
    """
    if value is not None and len(value) > max_length:
        raise ValueError(f"{label}は{max_length}文字以内で入力してください")
    return value


def _is_http_url(value: str) -> bool:
    """スキームが http か https で、ホスト名があるURLかどうか。

    画面で <img src> に入れる値なので、javascript: や data: などを保存させない。
    HttpUrl 型は保存する値を書き換える（末尾に / を足すなど）ので使わない
    """
    try:
        url = urlsplit(value)
    except ValueError:  # 閉じていない [ など、URLとして解釈できない
        return False
    # urlsplit はスキームを小文字にするので、HTTPS:// も通る
    return url.scheme in ("http", "https") and bool(url.hostname)


class BookCreate(BaseModel):
    """書籍登録のリクエスト"""

    model_config = ConfigDict(extra="forbid")

    isbn: str | None = None
    title: str
    author: str | None = None
    publisher: str | None = None
    published_date: str | None = None
    list_price: int | None = Field(default=None, ge=0, le=MAX_PRICE)
    cover_image_url: str | None = None

    @field_validator("isbn")
    @classmethod
    def _normalize_isbn(cls, value: str | None) -> str | None:
        # InvalidIsbnError は ValueError のサブクラスなので 422 になる
        return normalize_isbn(value)

    @field_validator("title")
    @classmethod
    def _validate_title(cls, value: str) -> str:
        value = value.strip()
        if value == "":
            raise ValueError("書名を入力してください")
        _check_max_length(value, MAX_TITLE_LENGTH, "書名")
        return value

    @field_validator("author")
    @classmethod
    def _validate_author(cls, value: str | None) -> str | None:
        return _check_max_length(_blank_to_none(value), MAX_AUTHOR_LENGTH, "著者")

    @field_validator("publisher")
    @classmethod
    def _validate_publisher(cls, value: str | None) -> str | None:
        return _check_max_length(_blank_to_none(value), MAX_PUBLISHER_LENGTH, "出版社")

    @field_validator("published_date")
    @classmethod
    def _validate_published_date(cls, value: str | None) -> str | None:
        return _check_max_length(
            _blank_to_none(value), MAX_PUBLISHED_DATE_LENGTH, "出版日"
        )

    @field_validator("cover_image_url")
    @classmethod
    def _validate_cover_image_url(cls, value: str | None) -> str | None:
        value = _check_max_length(
            _blank_to_none(value), MAX_COVER_IMAGE_URL_LENGTH, "表紙画像のURL"
        )
        if value is not None and not _is_http_url(value):
            raise ValueError(
                "表紙画像のURLは http:// または https:// で始まるURLを入力してください"
            )
        return value


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
    amount: int = Field(ge=0, le=MAX_PRICE)
    store: str | None = None
    memo: str | None = None

    @field_validator("store")
    @classmethod
    def _validate_store(cls, value: str | None) -> str | None:
        return _check_max_length(_blank_to_none(value), MAX_STORE_LENGTH, "購入店")

    @field_validator("memo")
    @classmethod
    def _validate_memo(cls, value: str | None) -> str | None:
        return _check_max_length(_blank_to_none(value), MAX_MEMO_LENGTH, "メモ")


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
    def _validate_memo(cls, value: str | None) -> str | None:
        return _check_max_length(_blank_to_none(value), MAX_MEMO_LENGTH, "メモ")

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
