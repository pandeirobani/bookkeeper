from fastapi import APIRouter
from sqlalchemy import Integer, cast, func, select

from app.models import Purchase
from app.routers.books import SessionDep
from app.schemas import YearlyExpenseResponse

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


@router.get("/yearly")
def list_yearly_expenses(session: SessionDep) -> list[YearlyExpenseResponse]:
    """購入記録のある年ごとに、書籍費の合計と件数を新しい年から順に返す。

    書籍費は購入記録の金額で集計し、本の定価は使わない。年は購入日で決める
    """
    # SQLiteは日付を 'YYYY-MM-DD' の文字列で保存しているので、strftime で年を取り出す
    year = cast(func.strftime("%Y", Purchase.purchased_on), Integer)
    rows = session.execute(
        select(
            year.label("year"),
            func.sum(Purchase.amount).label("total"),
            func.count(Purchase.id).label("count"),
        )
        .group_by(year)
        .order_by(year.desc())
    )
    return [
        YearlyExpenseResponse(year=row.year, total=row.total, count=row.count)
        for row in rows
    ]
