from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_session
from app.errors import api_error
from app.models import Book, ReadingRecord
from app.schemas import BookCreate, BookDisposalUpdate, BookResponse

router = APIRouter(prefix="/api/books", tags=["books"])

SessionDep = Annotated[Session, Depends(get_session)]

# SQLiteの整数の最大値。これを超えるIDでDBを検索すると500になるので、422にする
SQLITE_MAX_INTEGER = 2**63 - 1
IdPath = Annotated[int, Path(le=SQLITE_MAX_INTEGER)]

# books.isbn のUNIQUE制約に違反したときのSQLiteのエラー文
# （例: "UNIQUE constraint failed: books.isbn"）に含まれる列名
_ISBN_UNIQUE_COLUMN = "books.isbn"


def get_book_or_404(session: Session, book_id: int) -> Book:
    book = session.get(Book, book_id)
    if book is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "not_found",
            ["path", "book_id"],
            f"ID {book_id} の本は見つかりません",
        )
    return book


def _ensure_isbn_available(
    session: Session, isbn: str | None, exclude_book_id: int | None = None
) -> None:
    """ISBNが他の本で使われていれば409にする。更新時は自分自身を除いて調べる"""
    if isbn is None:
        return
    query = select(Book.id).where(Book.isbn == isbn)
    if exclude_book_id is not None:
        query = query.where(Book.id != exclude_book_id)
    existing_book_id = session.scalar(query)
    if existing_book_id is not None:
        raise _isbn_conflict(existing_book_id)


def _isbn_conflict(existing_book_id: int) -> HTTPException:
    """ISBNの重複の409。画面から登録済みの本へ案内できるよう、そのIDを返す。

    ISBNは入力欄に見えているので、入力エラーと同じくメッセージには入れない
    """
    return api_error(
        status.HTTP_409_CONFLICT,
        "already_exists",
        ["body", "isbn"],
        "このISBNの本はすでに登録されています",
        ctx={"book_id": existing_book_id},
    )


@contextmanager
def _isbn_conflict_as_409(session: Session, isbn: str | None) -> Iterator[None]:
    """書き込み中のISBNのUNIQUE制約の違反を409にする。

    _ensure_isbn_available の後に、別のリクエストが同じISBNを登録した場合
    （登録ボタンを2回押したなど）の安全網。それ以外の IntegrityError は
    想定外なので、409で隠さずにそのまま送出する
    """
    try:
        yield
    except IntegrityError as error:
        session.rollback()
        if _ISBN_UNIQUE_COLUMN not in str(error.orig):
            raise
        # ロールバック後は、競合したリクエストが登録した本が見える
        existing_book_id = session.scalar(select(Book.id).where(Book.isbn == isbn))
        if existing_book_id is None:
            raise
        raise _isbn_conflict(existing_book_id) from error


@router.get("")
def list_books(session: SessionDep) -> list[BookResponse]:
    """書籍を新しく登録した順に全件返す"""
    # created_at は秒単位なので、同じ秒に登録した本の順番は id で決める
    books = session.scalars(
        select(Book).order_by(Book.created_at.desc(), Book.id.desc())
    )
    return [BookResponse.model_validate(book) for book in books]


@router.get("/{book_id}")
def get_book(book_id: IdPath, session: SessionDep) -> BookResponse:
    """書籍を1件返す"""
    return BookResponse.model_validate(get_book_or_404(session, book_id))


@router.post("", status_code=status.HTTP_201_CREATED)
def create_book(payload: BookCreate, session: SessionDep) -> BookResponse:
    """書籍を登録する。読書記録も「未読」で同時に作成する"""
    _ensure_isbn_available(session, payload.isbn)

    book = Book(**payload.model_dump())
    # 重複したISBNのINSERTは、commit より前の flush で失敗する
    with _isbn_conflict_as_409(session, payload.isbn):
        session.add(book)
        session.flush()  # book.id を確定させる
        session.add(ReadingRecord(book_id=book.id, status="unread"))
        session.commit()

    return BookResponse.model_validate(book)


@router.put("/{book_id}")
def update_book(
    book_id: IdPath, payload: BookCreate, session: SessionDep
) -> BookResponse:
    """書籍の書誌情報を置き換える。送られなかった任意項目はNULLになる。読書記録は変えない"""
    book = get_book_or_404(session, book_id)
    _ensure_isbn_available(session, payload.isbn, exclude_book_id=book_id)

    for field, value in payload.model_dump().items():
        setattr(book, field, value)
    with _isbn_conflict_as_409(session, payload.isbn):
        session.commit()

    return BookResponse.model_validate(book)


@router.put("/{book_id}/disposal")
def update_book_disposal(
    book_id: IdPath, payload: BookDisposalUpdate, session: SessionDep
) -> BookResponse:
    """手放した日を設定する。NULLを送ると手元に戻す。書誌情報や記録は変えない"""
    book = get_book_or_404(session, book_id)
    book.disposed_on = payload.disposed_on
    session.commit()

    return BookResponse.model_validate(book)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(book_id: IdPath, session: SessionDep) -> None:
    """書籍を削除する。読書記録と購入記録もDBのCASCADEで一緒に削除される"""
    book = get_book_or_404(session, book_id)
    session.delete(book)
    session.commit()
