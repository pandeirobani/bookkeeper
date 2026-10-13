"""積読の一覧API GET /api/tsundoku のテスト"""

import pytest
from fastapi.testclient import TestClient


def create_book(
    client: TestClient, title: str = "テスト書籍", author: str | None = None
) -> int:
    """本を登録する。読書記録は「未読」で作られる"""
    response = client.post("/api/books", json={"title": title, "author": author})
    assert response.status_code == 201
    return response.json()["id"]


def create_purchase(
    client: TestClient, book_id: int, purchased_on: str, amount: int = 1000
) -> None:
    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={"purchased_on": purchased_on, "amount": amount},
    )
    assert response.status_code == 201


def set_status(client: TestClient, book_id: int, status: str) -> None:
    response = client.put(
        f"/api/books/{book_id}/reading-record", json={"status": status}
    )
    assert response.status_code == 200


def set_disposed_on(client: TestClient, book_id: int, disposed_on: str | None) -> None:
    response = client.put(
        f"/api/books/{book_id}/disposal", json={"disposed_on": disposed_on}
    )
    assert response.status_code == 200


def get_tsundoku(client: TestClient) -> list[dict[str, object]]:
    response = client.get("/api/tsundoku")
    assert response.status_code == 200
    return response.json()


def tsundoku_book_ids(client: TestClient) -> list[int]:
    response = client.get("/api/tsundoku")
    assert response.status_code == 200
    return [row["book"]["id"] for row in response.json()]


# --- 正常系 ---


def test_returns_empty_list_without_books(client: TestClient):
    assert get_tsundoku(client) == []


def test_returns_unread_purchased_book(client: TestClient):
    book_id = create_book(client, title="吾輩は猫である", author="夏目漱石")
    create_purchase(client, book_id, "2025-03-01", 1980)

    assert get_tsundoku(client) == [
        {
            "book": {"id": book_id, "title": "吾輩は猫である", "author": "夏目漱石"},
            "status": "unread",
            "first_purchased_on": "2025-03-01",
            "first_purchase_amount": 1980,
            "purchase_count": 1,
        }
    ]


def test_includes_reading_book(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2025-03-01")
    set_status(client, book_id, "reading")

    [row] = get_tsundoku(client)
    assert row["status"] == "reading"


def test_excludes_finished_book(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2025-03-01")
    set_status(client, book_id, "finished")

    assert get_tsundoku(client) == []


def test_excludes_book_without_purchases(client: TestClient):
    # 図書館で借りた本やもらった本
    create_book(client)

    assert get_tsundoku(client) == []


def test_excludes_disposed_book(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2025-03-01")
    set_disposed_on(client, book_id, "2025-09-01")

    assert get_tsundoku(client) == []


def test_includes_book_bought_again_after_disposal(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2025-03-01", 1980)
    set_disposed_on(client, book_id, "2025-09-01")
    # 手放した日より後の購入なので、手元に戻る
    create_purchase(client, book_id, "2026-01-10", 800)

    [row] = get_tsundoku(client)
    # 積み始めた日と金額は、最初の購入のもの
    assert row["first_purchased_on"] == "2025-03-01"
    assert row["first_purchase_amount"] == 1980
    assert row["purchase_count"] == 2


def test_uses_earliest_purchase_regardless_of_recorded_order(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2026-01-10", 800)
    create_purchase(client, book_id, "2025-03-01", 1980)

    [row] = get_tsundoku(client)
    assert row["first_purchased_on"] == "2025-03-01"
    assert row["first_purchase_amount"] == 1980


def test_uses_first_recorded_purchase_on_same_day(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2025-03-01", 1980)
    create_purchase(client, book_id, "2025-03-01", 500)

    [row] = get_tsundoku(client)
    assert row["first_purchase_amount"] == 1980
    assert row["purchase_count"] == 2


def test_is_ordered_by_first_purchased_on_asc(client: TestClient):
    middle = create_book(client, title="真ん中")
    newest = create_book(client, title="最近買った本")
    oldest = create_book(client, title="長く積んでいる本")
    create_purchase(client, middle, "2025-06-01")
    create_purchase(client, newest, "2026-10-01")
    create_purchase(client, oldest, "2024-01-01")
    # 最近また買っても、最初の購入日で並べる
    create_purchase(client, oldest, "2026-10-12")

    assert tsundoku_book_ids(client) == [oldest, middle, newest]


def test_books_first_purchased_on_same_day_are_ordered_by_id(client: TestClient):
    first = create_book(client, title="先に登録した本")
    second = create_book(client, title="後に登録した本")
    create_purchase(client, second, "2025-03-01")
    create_purchase(client, first, "2025-03-01")

    assert tsundoku_book_ids(client) == [first, second]


@pytest.mark.parametrize(
    ("status", "included"),
    [("unread", True), ("reading", True), ("finished", False)],
)
def test_returns_to_list_when_status_changes_back(
    client: TestClient, status: str, included: bool
):
    book_id = create_book(client)
    create_purchase(client, book_id, "2025-03-01")
    set_status(client, book_id, "finished")

    set_status(client, book_id, status)

    assert tsundoku_book_ids(client) == ([book_id] if included else [])
