"""AIのアプリ(Claudeなど)からBookKeeperのデータを読むためのMCPサーバー。stdioで起動する"""

from typing import Annotated

from mcp.server.mcpserver import MCPServer
from pydantic import Field

from app.database import SessionLocal
from app.schemas import (
    MonthExpenseDetailResponse,
    TsundokuResponse,
    YearExpenseDetailResponse,
    YearlyExpenseResponse,
)
from app.services import books as books_service
from app.services import expenses as expenses_service
from app.services import tsundoku as tsundoku_service
from app.services.books import BookDetail, BookSearchResult, ReadingStatus

server = MCPServer("BookKeeper")

# 書籍費のツールの引数。サービスは date で扱える範囲を前提にしているので、
# 範囲外の値は関数を実行する前に止める（API の YearPath・MonthPath と同じ範囲）
Year = Annotated[int, Field(ge=1, le=9999, description="西暦の年（例：2026）")]
Month = Annotated[int, Field(ge=1, le=12, description="月（1〜12）")]


@server.tool()
def ping() -> str:
    """サーバーにつながっているか確かめる"""
    return "pong"


@server.tool()
def list_tsundoku() -> list[TsundokuResponse]:
    """積読の本を長く積んでいる順（最初の購入日の古い順）に返す。

    積読の定義は、読書状態(status)が未読(unread)か読書中(reading)であり、手放しておらず、
    購入記録が1件以上ある本。図書館で借りた本などと区別するため、買った本に限る。
    最初の購入日: first_purchased_on
    最初に購入した金額: first_purchase_amount
    購入記録の件数: purchase_count
    """
    with SessionLocal() as session:
        return tsundoku_service.list_tsundoku(session)


@server.tool()
def search_books(
    keyword: Annotated[
        str | None,
        Field(
            description="書名・著者から検索する。空白で区切ると、全ての語句を含む本に絞る"
        ),
    ] = None,
    statuses: Annotated[
        list[ReadingStatus] | None,
        Field(description="読書の状態。unread=未読、reading=読書中、finished=読了"),
    ] = None,
    limit: Annotated[int, Field(ge=1, le=100, description="返す本の最大件数")] = 20,
) -> BookSearchResult:
    """書名・著者のキーワードと読書の状態で書籍を検索し、新しく登録した順に返す。

    キーワードは空白(全角も含む)で区切り、すべての語がそれぞれ書名か著者の
    どちらかに含まれる本に一致する。空や空白だけのキーワードは、すべての本に一致する。
    読書状態は、指定したどれかに当てはまる本に一致する。指定しなければ絞り込まない。
    totalがbooksの件数より多い場合、まだ当てはまる本があることを使用者に伝え、
    さらにキーワードで絞るか尋ねること
    """
    with SessionLocal() as session:
        return books_service.search_books(session, keyword, statuses, limit)


@server.tool()
def get_book_detail(
    book_id: Annotated[int, Field(ge=1, description="探す本のID")],
) -> BookDetail:
    """本のIDから書誌情報・読書記録・購入記録を取得する。

    本のIDは他のツールの結果に含まれる。IDがわからないときは、
    先に書名や著者からsearch_booksで探してidを調べる。
    """
    with SessionLocal() as session:
        return books_service.get_book_detail(session, book_id)


@server.tool()
def list_yearly_expenses() -> list[YearlyExpenseResponse]:
    """書籍費を年ごとに集計し、合計金額と購入記録の件数を新しい年から順に返す。

    書籍費は、購入記録の実際に支払った金額（税込・円）の合計で、本の定価ではない。
    年は購入日で決める。購入記録のない年は含まれない。
    年をまたいだ比較や、どの年に多く使ったかを答えるときに使う。
    1年の中の月ごとの内訳は get_year_expenses、
    ある月に何の本を買ったかは get_month_expenses で取る
    """
    with SessionLocal() as session:
        return expenses_service.list_yearly_expenses(session)


@server.tool()
def get_year_expenses(year: Year) -> YearExpenseDetailResponse:
    """1年分の書籍費の合計金額と購入記録の件数を、月ごとの内訳と一緒に返す。

    書籍費は、購入記録の実際に支払った金額（税込・円）の合計で、本の定価ではない。
    内訳は1月から12月までの必ず12か月分で、購入のない月は0になる。
    購入記録のない年を指定してもエラーにはならず、すべて0で返る。
    「今年いちばん使った月は？」のように、1年の中で月を比べるときに使う。
    ある月に何の本を買ったかは get_month_expenses で取る
    """
    with SessionLocal() as session:
        return expenses_service.get_year_expenses(session, year)


@server.tool()
def get_month_expenses(year: Year, month: Month) -> MonthExpenseDetailResponse:
    """1か月分の書籍費の合計金額と購入記録の件数を、購入記録の明細と一緒に返す。

    書籍費は、購入記録の実際に支払った金額（税込・円）の合計で、本の定価ではない。
    明細は購入日の古い順で、どの本をいつ、いくらで、どこで買ったかがわかる。
    購入記録のない月を指定してもエラーにはならず、空の明細と0で返る。
    明細の本の詳しい情報は、book の id を get_book_detail に渡して取る
    """
    with SessionLocal() as session:
        return expenses_service.get_month_expenses(session, year, month)


if __name__ == "__main__":
    server.run()
