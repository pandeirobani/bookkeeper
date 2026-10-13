from datetime import date
from typing import Annotated

from fastapi import APIRouter, Path
from sqlalchemy import Integer, cast, func, select

from app.models import Purchase
from app.routers.books import SessionDep
from app.schemas import (
    MonthlyExpenseResponse,
    YearExpenseDetailResponse,
    YearlyExpenseResponse,
)

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

# Pythonの date で扱える年の範囲
YearPath = Annotated[int, Path(ge=1, le=9999)]


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


@router.get("/yearly/{year}")
def get_year_expenses(year: YearPath, session: SessionDep) -> YearExpenseDetailResponse:
    """1年分の書籍費の合計と件数を、月ごとの内訳と一緒に返す。

    購入のない月も0にして12か月分を返す。購入記録のない年も404にせず、全部0で返す
    """
    month = cast(func.strftime("%m", Purchase.purchased_on), Integer)
    rows = session.execute(
        select(
            month.label("month"),
            func.sum(Purchase.amount).label("total"),
            func.count(Purchase.id).label("count"),
        )
        # 購入日のインデックスが使えるよう、年は日付の範囲で絞り込む
        .where(Purchase.purchased_on.between(date(year, 1, 1), date(year, 12, 31)))
        .group_by(month)
    )
    by_month = {row.month: (row.total, row.count) for row in rows}

    months: list[MonthlyExpenseResponse] = []
    for m in range(1, 13):
        total, count = by_month.get(m, (0, 0))
        months.append(MonthlyExpenseResponse(month=m, total=total, count=count))
    return YearExpenseDetailResponse(
        year=year,
        total=sum(m.total for m in months),
        count=sum(m.count for m in months),
        months=months,
    )
