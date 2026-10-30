"""本を検索する処理。MCP サーバーから使う

画面の検索はブラウザの中で全件から絞り込んでいる（frontend/src/utils/search.ts）。
MCP では AI が全件を受け取らずに済むよう、サーバーで絞り込む。
一致のルールは画面と同じにする
"""

import unicodedata
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Book, ReadingRecord

ReadingStatus = Literal["unread", "reading", "finished"]


class BookSearchItem(BaseModel):
    """検索に当てはまった本1冊。詳しい情報は、本の詳細のツールで id を指定して取る"""

    id: int = Field(description="本の ID。本の詳細のツールに渡す")
    title: str = Field(description="書名")
    author: str | None = Field(description="著者。複数の著者はカンマ区切り")
    reading_status: ReadingStatus | None = Field(
        description="読書状態。unread は未読、reading は読書中、finished は読了"
    )
    disposed_on: date | None = Field(
        description="売った・譲ったなどで手放した日。手元にある本は null"
    )


class BookSearchResult(BaseModel):
    """本の検索の結果"""

    total: int = Field(
        description=(
            "条件に当てはまった本の数。books の件数より多ければ、limit で切れている"
        )
    )
    books: list[BookSearchItem] = Field(
        description="当てはまった本。新しく登録した順に、最大で limit 冊"
    )


def _normalize(text: str) -> str:
    """比べる前にそろえる。全角と半角（ＡとA、１と1など）、大文字と小文字の違いをなくす"""
    return unicodedata.normalize("NFKC", text).lower()


def _matches_keyword(title: str, author: str | None, terms: list[str]) -> bool:
    """すべての語が、それぞれ書名か著者のどちらかに含まれれば一致とする"""
    normalized_title = _normalize(title)
    normalized_author = _normalize(author or "")
    return all(term in normalized_title or term in normalized_author for term in terms)


def search_books(
    session: Session,
    keyword: str | None,
    statuses: list[ReadingStatus] | None,
    limit: int,
) -> BookSearchResult:
    """書名・著者のキーワードと読書状態で本を絞り込み、新しく登録した順に返す。

    キーワードは空白（全角の空白も）で区切り、すべての語がそれぞれ書名か著者の
    どちらかに含まれる本に一致する。空や空白だけのキーワードは、すべての本に一致する。
    読書状態は、指定したどれかに当てはまる本に一致する。指定しなければ絞り込まない
    """
    terms = _normalize(keyword or "").split()
    # 一致のルール（NFKC での正規化）は SQL では書けないので、全件を読んでから絞り込む。
    # 1人で使う蔵書の量なら、これで十分速い
    rows = session.execute(
        select(Book.id, Book.title, Book.author, ReadingRecord.status, Book.disposed_on)
        .outerjoin(ReadingRecord, ReadingRecord.book_id == Book.id)
        .order_by(Book.created_at.desc(), Book.id.desc())
    )
    matched = [
        BookSearchItem(
            id=book_id,
            title=title,
            author=author,
            reading_status=reading_status,
            disposed_on=disposed_on,
        )
        for book_id, title, author, reading_status, disposed_on in rows
        if _matches_keyword(title, author, terms)
        and (not statuses or reading_status in statuses)
    ]
    return BookSearchResult(total=len(matched), books=matched[:limit])
