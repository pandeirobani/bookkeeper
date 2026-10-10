from fastapi import APIRouter, status

from app.models import Purchase
from app.routers.books import SessionDep, get_book_or_404
from app.schemas import PurchaseCreate, PurchaseResponse

router = APIRouter(prefix="/api", tags=["purchases"])


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
