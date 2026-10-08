"""APIの入出力スキーマ"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.isbn import normalize_isbn


class BookCreate(BaseModel):
    """書籍登録のリクエスト"""

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
    def _blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


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
    created_at: datetime
