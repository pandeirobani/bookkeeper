"""1か月分の書籍費の明細API GET /api/expenses/yearly/{year}/months/{month} のテスト"""

import pytest
from fastapi.testclient import TestClient


def create_book(
    client: TestClient, title: str = "テスト書籍", author: str | None = None
) -> int:
    response = client.post(
        "/api/books", json={"title": title, "author": author, "list_price": 9999}
    )
    assert response.status_code == 201
    return response.json()["id"]


def create_purchase(
    client: TestClient,
    book_id: int,
    purchased_on: str,
    amount: int = 1000,
    store: str | None = None,
    memo: str | None = None,
) -> int:
    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={
            "purchased_on": purchased_on,
            "amount": amount,
            "store": store,
            "memo": memo,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def get_month(client: TestClient, year: int, month: int) -> dict[str, object]:
    response = client.get(f"/api/expenses/yearly/{year}/months/{month}")
    assert response.status_code == 200
    return response.json()


def purchase_ids(body: dict[str, object]) -> list[int]:
    purchases = body["purchases"]
    assert isinstance(purchases, list)
    return [p["id"] for p in purchases]


# --- 正常系 ---


def test_returns_empty_for_month_without_purchases(client: TestClient):
    assert get_month(client, 2026, 10) == {
        "year": 2026,
        "month": 10,
        "total": 0,
        "count": 0,
        "purchases": [],
    }


def test_returns_purchase_with_book(client: TestClient):
    book_id = create_book(client, title="吾輩は猫である", author="夏目漱石")
    purchase_id = create_purchase(
        client, book_id, "2026-10-03", 1980, store="〇〇書店", memo="文庫"
    )

    assert get_month(client, 2026, 10) == {
        "year": 2026,
        "month": 10,
        "total": 1980,
        "count": 1,
        "purchases": [
            {
                "id": purchase_id,
                "purchased_on": "2026-10-03",
                "amount": 1980,
                "store": "〇〇書店",
                "memo": "文庫",
                "book": {
                    "id": book_id,
                    "title": "吾輩は猫である",
                    "author": "夏目漱石",
                },
            }
        ],
    }


def test_sums_amount_and_counts_purchases(client: TestClient):
    book_id = create_book(client)
    other_id = create_book(client, title="別の本")
    create_purchase(client, book_id, "2026-10-01", 1980)
    create_purchase(client, other_id, "2026-10-31", 880)
    create_purchase(client, book_id, "2026-10-15", 0)

    body = get_month(client, 2026, 10)

    assert body["total"] == 2860
    assert body["count"] == 3


def test_is_ordered_by_purchased_on_asc(client: TestClient):
    book_id = create_book(client)
    middle = create_purchase(client, book_id, "2026-10-15")
    last = create_purchase(client, book_id, "2026-10-31")
    first = create_purchase(client, book_id, "2026-10-01")

    assert purchase_ids(get_month(client, 2026, 10)) == [first, middle, last]


def test_purchases_on_same_day_are_ordered_by_id_asc(client: TestClient):
    book_id = create_book(client)
    first = create_purchase(client, book_id, "2026-10-10")
    second = create_purchase(client, book_id, "2026-10-10")

    assert purchase_ids(get_month(client, 2026, 10)) == [first, second]


def test_excludes_other_months_and_years(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2026-01-31")
    first_day = create_purchase(client, book_id, "2026-02-01")
    last_day = create_purchase(client, book_id, "2026-02-28")
    create_purchase(client, book_id, "2026-03-01")
    create_purchase(client, book_id, "2025-02-15")

    assert purchase_ids(get_month(client, 2026, 2)) == [first_day, last_day]


def test_includes_leap_day(client: TestClient):
    book_id = create_book(client)
    leap_day = create_purchase(client, book_id, "2028-02-29")

    assert purchase_ids(get_month(client, 2028, 2)) == [leap_day]


def test_includes_purchases_of_disposed_book(client: TestClient):
    book_id = create_book(client)
    purchase_id = create_purchase(client, book_id, "2026-03-01")
    response = client.put(
        f"/api/books/{book_id}/disposal", json={"disposed_on": "2026-09-01"}
    )
    assert response.status_code == 200

    assert purchase_ids(get_month(client, 2026, 3)) == [purchase_id]


def test_excludes_purchases_of_deleted_book(client: TestClient):
    book_id = create_book(client)
    deleted_id = create_book(client, title="削除する本")
    purchase_id = create_purchase(client, book_id, "2026-03-01")
    create_purchase(client, deleted_id, "2026-03-02")
    assert client.delete(f"/api/books/{deleted_id}").status_code == 204

    assert purchase_ids(get_month(client, 2026, 3)) == [purchase_id]


@pytest.mark.parametrize(("year", "month"), [(1, 1), (9999, 12)])
def test_accepts_min_and_max_month(client: TestClient, year: int, month: int):
    body = get_month(client, year, month)

    assert (body["year"], body["month"]) == (year, month)


# --- エラー ---


@pytest.mark.parametrize(
    ("path", "loc", "msg"),
    [
        ("2026/months/0", "month", "月は1以上で入力してください"),
        ("2026/months/13", "month", "月は12以下で入力してください"),
        ("2026/months/abc", "month", "月は整数で入力してください"),
        ("0/months/1", "year", "年は1以上で入力してください"),
        ("10000/months/1", "year", "年は9999以下で入力してください"),
    ],
)
def test_invalid_year_or_month_returns_422(
    client: TestClient, path: str, loc: str, msg: str
):
    response = client.get(f"/api/expenses/yearly/{path}")

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["path", loc]
    assert error["msg"] == msg
