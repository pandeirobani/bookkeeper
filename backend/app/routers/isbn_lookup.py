"""ISBNから書誌情報を取得するAPI。取得元は openBD（docs/openbd.md）"""

import logging
from dataclasses import asdict
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Query, status
from pydantic import AfterValidator

from app.errors import api_error
from app.isbn import normalize_isbn
from app.openbd import (
    OpenBDTimeoutError,
    OpenBDUnavailableError,
    fetch_book_info,
    get_openbd_client,
)
from app.schemas import IsbnLookupResponse

router = APIRouter(prefix="/api", tags=["isbn-lookup"])

logger = logging.getLogger(__name__)

OpenBDClientDep = Annotated[httpx.Client, Depends(get_openbd_client)]


def _require_isbn(value: str) -> str:
    """ISBN-13にそろえる。空の場合も、取得する本を決められないので入力エラーにする"""
    # InvalidIsbnError は ValueError のサブクラスなので 422 になる
    isbn = normalize_isbn(value)
    if isbn is None:
        raise ValueError("ISBNを入力してください")
    return isbn


IsbnQuery = Annotated[str, Query(), AfterValidator(_require_isbn)]


@router.get("/isbn-lookup")
def lookup_isbn(isbn: IsbnQuery, client: OpenBDClientDep) -> IsbnLookupResponse:
    """ISBNから書誌情報を取得する。DBには保存しない"""
    try:
        book_info = fetch_book_info(client, isbn)
    except OpenBDTimeoutError as error:
        logger.warning("ISBN %s の書誌情報の取得がタイムアウトしました", isbn)
        raise api_error(
            status.HTTP_504_GATEWAY_TIMEOUT,
            "lookup_timeout",
            [],
            "書誌情報の取得に時間がかかったため中断しました。"
            "時間をおいて試すか、手動で入力してください",
        ) from error
    except OpenBDUnavailableError as error:
        logger.warning("ISBN %s の書誌情報を取得できませんでした: %s", isbn, error)
        raise api_error(
            status.HTTP_502_BAD_GATEWAY,
            "lookup_failed",
            [],
            "書誌情報を取得できませんでした。時間をおいて試すか、手動で入力してください",
        ) from error

    if book_info is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "not_found",
            ["query", "isbn"],
            "このISBNの本は見つかりませんでした。書誌情報を手動で入力してください",
        )
    return IsbnLookupResponse(isbn=isbn, **asdict(book_info))
