from fastapi import APIRouter

from app.routers.books import SessionDep
from app.schemas import TsundokuResponse
from app.services import tsundoku as tsundoku_service

router = APIRouter(prefix="/api/tsundoku", tags=["tsundoku"])


@router.get("")
def list_tsundoku(session: SessionDep) -> list[TsundokuResponse]:
    """積読の本を、長く積んでいる順（最初の購入日の古い順）に返す。

    積読の決まりは services/tsundoku.py を参照
    """
    return tsundoku_service.list_tsundoku(session)
