"""MCP サーバー（app/mcp_server.py）のテスト"""

from collections.abc import AsyncIterator
from datetime import date

import pytest
from mcp import Client
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app import mcp_server
from app.models import Book, Purchase, ReadingRecord


@pytest.fixture
def anyio_backend() -> str:
    """非同期のテストを asyncio で動かす（anyio の pytest プラグインの設定）"""
    return "asyncio"


@pytest.fixture
async def mcp_client(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[Client]:
    """DBを一時DBに差し替えて、MCP サーバーにつないだクライアント。

    サーバーを子プロセスで起動せず、同じプロセスの中でつなぐ。
    ツールは mcp_server.SessionLocal でセッションを開くので、それを差し替える
    """
    monkeypatch.setattr(mcp_server, "SessionLocal", sessionmaker(bind=engine))
    async with Client(mcp_server.server) as client:
        yield client


@pytest.mark.anyio
async def test_ping_returns_pong(mcp_client: Client) -> None:
    result = await mcp_client.call_tool("ping", {})

    assert not result.is_error
    assert result.structured_content == {"result": "pong"}


@pytest.mark.anyio
async def test_list_tsundoku_returns_empty_list_without_books(
    mcp_client: Client,
) -> None:
    result = await mcp_client.call_tool("list_tsundoku", {})

    assert not result.is_error
    assert result.structured_content == {"result": []}


@pytest.mark.anyio
async def test_list_tsundoku_returns_book(
    mcp_client: Client,
    session: Session,
) -> None:
    # 準備：積読の本を 1 冊、一時 DB に入れる
    book = Book(title="積んでいる本", author="著者")
    session.add(book)
    session.flush()  # DB に送って、book.id を決める（まだ確定はしていない）
    session.add(ReadingRecord(book_id=book.id, status="unread"))
    session.add(Purchase(book_id=book.id, purchased_on=date(2026, 1, 15), amount=1980))
    session.commit()  # 確定する。これでツールの窓口からも見えるようになる

    # 実行
    result = await mcp_client.call_tool("list_tsundoku", {})

    # 確認
    assert not result.is_error
    assert result.structured_content == {
        "result": [
            {
                "book": {"id": book.id, "title": book.title, "author": book.author},
                "status": "unread",
                "first_purchased_on": "2026-01-15",
                "first_purchase_amount": 1980,
                "purchase_count": 1,
            }
        ]
    }


@pytest.mark.anyio
async def test_all_tools_have_docstring(
    mcp_client: Client,
) -> None:
    tools = await mcp_client.list_tools()

    assert tools.tools
    for tool in tools.tools:
        assert tool.description, f"{tool.name} に説明文がない"


@pytest.mark.anyio
async def test_search_books_filters_by_keyword(
    mcp_client: Client,
    session: Session,
) -> None:
    book = Book(title="検索する本", author="著者")
    session.add(book)
    session.flush()
    session.add(ReadingRecord(book_id=book.id, status="unread"))

    book2 = Book(title="検索しない本", author="著者")
    session.add(book2)
    session.flush()
    session.add(ReadingRecord(book_id=book2.id, status="unread"))

    session.commit()

    result = await mcp_client.call_tool("search_books", {"keyword": "検索する"})

    assert not result.is_error
    assert result.structured_content == {
        "total": 1,
        "books": [
            {
                "id": book.id,
                "title": book.title,
                "author": book.author,
                "reading_status": "unread",
                "disposed_on": None,
            }
        ],
    }


@pytest.mark.anyio
async def test_search_books_over_limit(
    mcp_client: Client,
) -> None:
    result = await mcp_client.call_tool("search_books", {"limit": 101})

    assert result.is_error
    assert "less than or equal to 100" in result.content[0].text


@pytest.mark.anyio
async def test_get_book_detail_return_book(
    mcp_client: Client,
    session: Session,
) -> None:
    book = Book(title="取得する本", author="著者")
    session.add(book)
    session.flush()
    session.add(ReadingRecord(book_id=book.id, status="unread"))
    session.add(Purchase(book_id=book.id, purchased_on=date(2026, 1, 15), amount=1980))
    session.commit()

    result = await mcp_client.call_tool("get_book_detail", {"book_id": book.id})

    assert not result.is_error
    assert result.structured_content["id"] == book.id
    assert result.structured_content["title"] == book.title
    assert result.structured_content["author"] == book.author
    assert result.structured_content["reading"]["status"] == "unread"
    assert result.structured_content["purchase_total"] == 1980


@pytest.mark.anyio
async def test_get_book_detail_book_not_found(
    mcp_client: Client,
) -> None:
    result = await mcp_client.call_tool("get_book_detail", {"book_id": 999})

    assert result.is_error
    assert "id が 999 の本はありません" in result.content[0].text


@pytest.mark.anyio
async def test_get_book_detail_book_id_below_1(mcp_client: Client) -> None:
    result = await mcp_client.call_tool("get_book_detail", {"book_id": 0})

    assert result.is_error
    assert "greater than or equal to 1" in result.content[0].text


def add_purchase(session: Session, purchased_on: date, amount: int) -> Book:
    """本を1冊登録し、購入記録を1件付ける"""
    book = Book(title=f"{purchased_on}に買った本", author="著者")
    session.add(book)
    session.flush()
    session.add(Purchase(book_id=book.id, purchased_on=purchased_on, amount=amount))
    session.commit()
    return book


@pytest.mark.anyio
async def test_list_yearly_expenses_returns_totals_by_year(
    mcp_client: Client,
    session: Session,
) -> None:
    add_purchase(session, date(2025, 12, 31), 1000)
    add_purchase(session, date(2026, 1, 1), 500)
    add_purchase(session, date(2026, 2, 1), 300)

    result = await mcp_client.call_tool("list_yearly_expenses", {})

    assert not result.is_error
    assert result.structured_content == {
        "result": [
            {"year": 2026, "total": 800, "count": 2},
            {"year": 2025, "total": 1000, "count": 1},
        ]
    }


@pytest.mark.anyio
async def test_get_year_expenses_returns_total_and_months(
    mcp_client: Client,
    session: Session,
) -> None:
    add_purchase(session, date(2026, 3, 10), 1200)
    add_purchase(session, date(2025, 3, 10), 9999)  # ほかの年は含めない

    result = await mcp_client.call_tool("get_year_expenses", {"year": 2026})

    assert not result.is_error
    assert result.structured_content["total"] == 1200
    assert result.structured_content["months"][2] == {
        "month": 3,
        "total": 1200,
        "count": 1,
    }


@pytest.mark.anyio
async def test_get_month_expenses_returns_purchases(
    mcp_client: Client,
    session: Session,
) -> None:
    book = add_purchase(session, date(2026, 3, 10), 1200)
    add_purchase(session, date(2026, 4, 1), 9999)  # ほかの月は含めない

    result = await mcp_client.call_tool(
        "get_month_expenses", {"year": 2026, "month": 3}
    )

    assert not result.is_error
    assert result.structured_content["total"] == 1200
    assert [p["book"]["id"] for p in result.structured_content["purchases"]] == [
        book.id
    ]


@pytest.mark.anyio
async def test_get_month_expenses_month_over_12(mcp_client: Client) -> None:
    result = await mcp_client.call_tool(
        "get_month_expenses", {"year": 2026, "month": 13}
    )

    assert result.is_error
    assert "less than or equal to 12" in result.content[0].text


@pytest.mark.anyio
async def test_get_year_expenses_year_below_1(mcp_client: Client) -> None:
    result = await mcp_client.call_tool("get_year_expenses", {"year": 0})

    assert result.is_error
    assert "greater than or equal to 1" in result.content[0].text
