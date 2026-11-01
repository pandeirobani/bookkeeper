"""積読の一覧を取り出す処理。API（routers/tsundoku.py）と MCP サーバーの両方から使う"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Book, Purchase, ReadingRecord
from app.schemas import BookSummaryResponse, TsundokuResponse

# 積読に含める読書状態。読みかけの本も、読み終えるまでは積読とみなす
_TSUNDOKU_STATUSES = ("unread", "reading")


def list_tsundoku(session: Session) -> list[TsundokuResponse]:
    """積読の本を、長く積んでいる順（最初の購入日の古い順）に返す。

    積読は、読書状態が未読か読書中で、手元にあり（手放していない）、
    購入記録が1件以上ある本。図書館で借りた本などと区別するため、買った本に限る。
    同じ日に買い始めた本は、本のIDの順にする
    """
    # 本ごとの最初の購入（購入日が同じなら先に記録したもの）と、購入記録の件数
    purchases = select(
        Purchase.book_id,
        Purchase.purchased_on,
        Purchase.amount,
        func.row_number()
        .over(
            partition_by=Purchase.book_id,
            order_by=(Purchase.purchased_on, Purchase.id),
        )
        .label("order_in_book"),
        func.count().over(partition_by=Purchase.book_id).label("purchase_count"),
    ).subquery()

    rows = session.execute(
        select(
            Book,
            ReadingRecord.status,
            purchases.c.purchased_on,
            purchases.c.amount,
            purchases.c.purchase_count,
        )
        .join(ReadingRecord, ReadingRecord.book_id == Book.id)
        .join(purchases, purchases.c.book_id == Book.id)
        .where(
            purchases.c.order_in_book == 1,
            ReadingRecord.status.in_(_TSUNDOKU_STATUSES),
            Book.disposed_on.is_(None),
        )
        .order_by(purchases.c.purchased_on, Book.id)
    )
    return [
        TsundokuResponse(
            book=BookSummaryResponse.model_validate(book),
            status=status,
            first_purchased_on=purchased_on,
            first_purchase_amount=amount,
            purchase_count=purchase_count,
        )
        for book, status, purchased_on, amount, purchase_count in rows
    ]
