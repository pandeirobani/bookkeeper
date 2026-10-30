"""AIのアプリ(Claudeなど)からBookKeeperのデータを読むためのMCPサーバー。stdioで起動する"""

from typing import Annotated

from mcp.server.mcpserver import MCPServer
from pydantic import Field

from app.database import SessionLocal
from app.schemas import TsundokuResponse
from app.services import books as books_service
from app.services import tsundoku as tsundoku_service
from app.services.books import BookDetail, BookSearchResult, ReadingStatus

server = MCPServer("BookKeeper")


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


if __name__ == "__main__":
    server.run()
