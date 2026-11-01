from typing import Annotated

from fastapi import APIRouter, Path

from app.routers.books import SessionDep
from app.schemas import (
    MonthExpenseDetailResponse,
    YearExpenseDetailResponse,
    YearlyExpenseResponse,
)
from app.services import expenses as expenses_service

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

# Pythonの date で扱える年の範囲
YearPath = Annotated[int, Path(ge=1, le=9999)]
MonthPath = Annotated[int, Path(ge=1, le=12)]


@router.get("/yearly")
def list_yearly_expenses(session: SessionDep) -> list[YearlyExpenseResponse]:
    """購入記録のある年ごとに、書籍費の合計と件数を新しい年から順に返す。

    集計の決まりは services/expenses.py を参照
    """
    return expenses_service.list_yearly_expenses(session)


@router.get("/yearly/{year}")
def get_year_expenses(year: YearPath, session: SessionDep) -> YearExpenseDetailResponse:
    """1年分の書籍費の合計と件数を、月ごとの内訳と一緒に返す。

    購入記録のない年も404にせず、全部0で返す
    """
    return expenses_service.get_year_expenses(session, year)


@router.get("/yearly/{year}/months/{month}")
def get_month_expenses(
    year: YearPath, month: MonthPath, session: SessionDep
) -> MonthExpenseDetailResponse:
    """1か月分の書籍費の合計と件数を、購入記録の明細と一緒に返す。

    購入記録のない月も404にせず、空の明細と0で返す
    """
    return expenses_service.get_month_expenses(session, year, month)
