from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Book, ReadingRecord
from app.schemas import BookCreate, BookDisposalUpdate, BookResponse

router = APIRouter(prefix="/api/books", tags=["books"])

SessionDep = Annotated[Session, Depends(get_session)]

# SQLiteの整数の最大値。これを超えるIDでDBを検索すると500になるので、422にする
SQLITE_MAX_INTEGER = 2**63 - 1
IdPath = Annotated[int, Path(le=SQLITE_MAX_INTEGER)]


def get_book_or_404(session: Session, book_id: int) -> Book:
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ID {book_id} の本は見つかりません",
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
    if session.scalar(query) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"ISBN {isbn} の本はすでに登録されています",
        )


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
