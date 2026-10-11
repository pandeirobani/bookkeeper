from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ReadingRecord
from app.routers.books import SessionDep, get_book_or_404
from app.schemas import ReadingRecordResponse

router = APIRouter(
    prefix="/api/books/{book_id}/reading-record", tags=["reading_records"]
)


def _get_reading_record_or_404(session: Session, book_id: int) -> ReadingRecord:
    get_book_or_404(session, book_id)
    # APIから登録した本には必ずあるので、ないのはDBを直接変更した場合だけ
    record = session.scalar(
        select(ReadingRecord).where(ReadingRecord.book_id == book_id)
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ID {book_id} の本の読書記録は見つかりません",
        )
    return record


@router.get("")
def get_reading_record(book_id: int, session: SessionDep) -> ReadingRecordResponse:
    """本の読書記録を返す"""
    return ReadingRecordResponse.model_validate(
        _get_reading_record_or_404(session, book_id)
    )
