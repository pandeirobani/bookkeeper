from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Book, ReadingRecord
from app.schemas import BookCreate, BookResponse

router = APIRouter(prefix="/api/books", tags=["books"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("")
def list_books(session: SessionDep) -> list[BookResponse]:
    """書籍を新しく登録した順に全件返す"""
    # created_at は秒単位なので、同じ秒に登録した本の順番は id で決める
    books = session.scalars(
        select(Book).order_by(Book.created_at.desc(), Book.id.desc())
    )
    return [BookResponse.model_validate(book) for book in books]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_book(payload: BookCreate, session: SessionDep) -> BookResponse:
    """書籍を登録する。読書記録も「未読」で同時に作成する"""
    if payload.isbn is not None:
        existing_id = session.scalar(select(Book.id).where(Book.isbn == payload.isbn))
        if existing_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"ISBN {payload.isbn} の本はすでに登録されています",
            )

    book = Book(**payload.model_dump())
    session.add(book)
    session.flush()  # book.id を確定させる
    session.add(ReadingRecord(book_id=book.id, status="unread"))
    session.commit()

    return BookResponse.model_validate(book)
