from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Purchase
from app.routers.books import SessionDep, get_book_or_404
from app.schemas import PurchaseCreate, PurchaseResponse

router = APIRouter(prefix="/api", tags=["purchases"])


def _get_purchase_or_404(session: Session, purchase_id: int) -> Purchase:
    purchase = session.get(Purchase, purchase_id)
    if purchase is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ID {purchase_id} の購入記録は見つかりません",
        )
    return purchase


@router.get("/books/{book_id}/purchases")
def list_purchases(book_id: int, session: SessionDep) -> list[PurchaseResponse]:
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
    book_id: int, payload: PurchaseCreate, session: SessionDep
) -> PurchaseResponse:
    """本に購入記録を追加する。手放した日（disposed_on）は変えない"""
    get_book_or_404(session, book_id)

    purchase = Purchase(book_id=book_id, **payload.model_dump())
    session.add(purchase)
    session.commit()

    return PurchaseResponse.model_validate(purchase)


@router.put("/purchases/{purchase_id}")
def update_purchase(
    purchase_id: int, payload: PurchaseCreate, session: SessionDep
) -> PurchaseResponse:
    """購入記録を置き換える。送られなかった任意項目はNULLになる。本の付け替えはできない"""
    purchase = _get_purchase_or_404(session, purchase_id)

    for field, value in payload.model_dump().items():
        setattr(purchase, field, value)
    session.commit()

    return PurchaseResponse.model_validate(purchase)
