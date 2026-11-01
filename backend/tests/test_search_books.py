"""本の検索（app/services/books.py の search_books）のテスト"""

from datetime import date

from sqlalchemy.orm import Session

from app.models import Book, ReadingRecord
from app.services.books import search_books


def add_book(
    session: Session,
    title: str,
    author: str | None = None,
    status: str | None = "unread",
    disposed_on: date | None = None,
) -> int:
    """本を登録する。status が None なら読書記録を作らない（DBを直接変更した場合）"""
    book = Book(title=title, author=author, disposed_on=disposed_on)
    session.add(book)
    session.flush()
    if status is not None:
        session.add(ReadingRecord(book_id=book.id, status=status))
    session.commit()
    return book.id


def titles(session: Session, keyword: str | None, statuses=None, limit=100) -> list:
    result = search_books(session, keyword, statuses, limit)
    return [book.title for book in result.books]


def test_returns_all_books_newest_first_without_conditions(session: Session) -> None:
    add_book(session, "古い本")
    add_book(session, "新しい本")

    assert titles(session, None) == ["新しい本", "古い本"]


def test_blank_keyword_matches_all_books(session: Session) -> None:
    add_book(session, "本A")
    add_book(session, "本B")

    assert titles(session, "　 ") == ["本B", "本A"]


def test_matches_title_or_author(session: Session) -> None:
    add_book(session, "ノルウェイの森", "村上春樹")
    add_book(session, "こころ", "夏目漱石")

    assert titles(session, "ノルウェイ") == ["ノルウェイの森"]
    assert titles(session, "漱石") == ["こころ"]


def test_all_terms_must_match_title_or_author(session: Session) -> None:
    add_book(session, "ノルウェイの森", "村上春樹")
    add_book(session, "海辺のカフカ", "村上春樹")

    # 全角の空白でも区切る
    assert titles(session, "村上　ノルウェイ") == ["ノルウェイの森"]
    assert titles(session, "村上 ノルウェイ 海辺") == []


def test_ignores_width_and_case(session: Session) -> None:
    add_book(session, "Ｐｙｔｈｏｎ入門", "ＧＵＩＤＯ")

    assert titles(session, "python") == ["Ｐｙｔｈｏｎ入門"]
    assert titles(session, "guido") == ["Ｐｙｔｈｏｎ入門"]


def test_filters_by_any_of_statuses(session: Session) -> None:
    add_book(session, "未読の本", status="unread")
    add_book(session, "読書中の本", status="reading")
    add_book(session, "読了の本", status="finished")

    assert titles(session, None, ["finished"]) == ["読了の本"]
    assert titles(session, None, ["unread", "reading"]) == ["読書中の本", "未読の本"]


def test_book_without_reading_record_matches_only_without_statuses(
    session: Session,
) -> None:
    add_book(session, "記録のない本", status=None)

    assert titles(session, None) == ["記録のない本"]
    assert titles(session, None, ["unread"]) == []


def test_limit_cuts_books_but_total_counts_all_matches(session: Session) -> None:
    for i in range(3):
        add_book(session, f"本{i}")

    result = search_books(session, None, None, 2)

    assert result.total == 3
    assert [book.title for book in result.books] == ["本2", "本1"]


def test_returns_book_fields(session: Session) -> None:
    book_id = add_book(
        session, "手放した本", "著者", status="finished", disposed_on=date(2026, 3, 1)
    )

    result = search_books(session, None, None, 10)

    assert result.model_dump() == {
        "total": 1,
        "books": [
            {
                "id": book_id,
                "title": "手放した本",
                "author": "著者",
                "reading_status": "finished",
                "disposed_on": date(2026, 3, 1),
            }
        ],
    }
