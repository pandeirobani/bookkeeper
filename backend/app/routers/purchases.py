from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.models import Purchase
from app.routers.books import IdPath, SessionDep, get_book_or_404
from app.schemas import PurchaseCreate, PurchaseResponse

router = APIRouter(prefix="/api", tags=["purchases"])


def _get_purchase_or_404(session: Session, purchase_id: int) -> Purchase:
    purchase = session.get(Purchase, purchase_id)
    if purchase is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "not_found",
            ["path", "purchase_id"],
            f"ID {purchase_id} の購入記録は見つかりません",
        )
    return purchase


@router.get("/books/{book_id}/purchases")
def list_purchases(book_id: IdPath, session: SessionDep) -> list[PurchaseResponse]:
    """本の購入記録を購入日の新しい順に返す"""
    get_book_or_404(session, book_id)

    # 同じ日の購入は後から記録したものを先にする
    purchases = session.scalars(
        select(Purchase)
        .where(Purchase.book_id == book_id)
        .order_by(Purchase.purchased_on.desc(), Purchase.id.desc())
    )
    return [PurchaseResponse.model_validate(purchase) for purchase in purchases]


@router.post("/books/{book_id}/purchases", status_code=status.HTTP_201_CREATED)
def create_purchase(
    book_id: IdPath, payload: PurchaseCreate, session: SessionDep
) -> PurchaseResponse:
    """本に購入記録を追加する。手放した日より後の購入なら、本を手元に戻す"""
    book = get_book_or_404(session, book_id)
    # 手放した日より後に買ったなら買い直しなので、disposed_on をNULLに戻す。
    # 手放した日以前の購入は、過去の購入を後から記録したものとして扱い、変えない
    if book.disposed_on is not None and payload.purchased_on > book.disposed_on:
        book.disposed_on = None

    purchase = Purchase(book_id=book_id, **payload.model_dump())
    session.add(purchase)
    session.commit()

    return PurchaseResponse.model_validate(purchase)


@router.put("/purchases/{purchase_id}")
def update_purchase(
    purchase_id: IdPath, payload: PurchaseCreate, session: SessionDep
) -> PurchaseResponse:
    """購入記録を置き換える。送られなかった任意項目はNULLになる。本の付け替えはできない"""
    purchase = _get_purchase_or_404(session, purchase_id)

    for field, value in payload.model_dump().items():
        setattr(purchase, field, value)
    session.commit()

    return PurchaseResponse.model_validate(purchase)


@router.delete("/purchases/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_purchase(purchase_id: IdPath, session: SessionDep) -> None:
    """購入記録を削除する。本は残る"""
    purchase = _get_purchase_or_404(session, purchase_id)
    session.delete(purchase)
    session.commit()
