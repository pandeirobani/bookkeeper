"""AIのアプリ(Claudeなど)からBookKeeperのデータを読むためのMCPサーバー。stdioで起動する"""

from mcp.server.mcpserver import MCPServer

from app.database import SessionLocal
from app.schemas import TsundokuResponse
from app.services import tsundoku as tsundoku_service

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


if __name__ == "__main__":
    server.run()
