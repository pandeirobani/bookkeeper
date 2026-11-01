"""書籍費を集計する処理。API（routers/expenses.py）と MCP サーバーの両方から使う

書籍費は購入記録の金額（purchases.amount）で集計し、本の定価は使わない。
年と月は購入日で決める
"""

from calendar import monthrange
from datetime import date

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import Session

from app.models import Book, Purchase
from app.schemas import (
    BookSummaryResponse,
    ExpensePurchaseResponse,
    MonthExpenseDetailResponse,
    MonthlyExpenseResponse,
    YearExpenseDetailResponse,
    YearlyExpenseResponse,
)


def list_yearly_expenses(session: Session) -> list[YearlyExpenseResponse]:
    """購入記録のある年ごとに、書籍費の合計と件数を新しい年から順に返す"""
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


def get_year_expenses(session: Session, year: int) -> YearExpenseDetailResponse:
    """1年分の書籍費の合計と件数を、月ごとの内訳と一緒に返す。

    購入のない月も0にして12か月分を返す。購入記録のない年も、全部0で返す。
    year は date で扱える 1〜9999 の範囲であること
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


def get_month_expenses(
    session: Session, year: int, month: int
) -> MonthExpenseDetailResponse:
    """1か月分の書籍費の合計と件数を、購入記録の明細と一緒に返す。

    明細は購入日の古い順で、同じ日の中は記録した順。購入記録のない月も、
    空の明細と0で返す。year は 1〜9999、month は 1〜12 の範囲であること
    """
    last_day = monthrange(year, month)[1]
    rows = session.execute(
        select(Purchase, Book)
        .join(Book, Purchase.book_id == Book.id)
        .where(
            Purchase.purchased_on.between(
                date(year, month, 1), date(year, month, last_day)
            )
        )
        .order_by(Purchase.purchased_on, Purchase.id)
    )
    purchases = [
        ExpensePurchaseResponse(
            id=purchase.id,
            purchased_on=purchase.purchased_on,
            amount=purchase.amount,
            store=purchase.store,
            memo=purchase.memo,
            book=BookSummaryResponse.model_validate(book),
        )
        for purchase, book in rows
    ]
    return MonthExpenseDetailResponse(
        year=year,
        month=month,
        total=sum(p.amount for p in purchases),
        count=len(purchases),
        purchases=purchases,
    )
