from fastapi import APIRouter, status
from sqlalchemy import select

from app.models import Purchase
from app.routers.books import SessionDep, get_book_or_404
from app.schemas import PurchaseCreate, PurchaseResponse

router = APIRouter(prefix="/api", tags=["purchases"])


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
