"""1年分の書籍費の集計API GET /api/expenses/yearly/{year} のテスト"""

import pytest
from fastapi.testclient import TestClient


def create_book(client: TestClient, title: str = "テスト書籍") -> int:
    response = client.post("/api/books", json={"title": title, "list_price": 9999})
    assert response.status_code == 201
    return response.json()["id"]


def create_purchase(
    client: TestClient, book_id: int, purchased_on: str, amount: int
) -> None:
    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={"purchased_on": purchased_on, "amount": amount},
    )
    assert response.status_code == 201


def get_year(client: TestClient, year: int) -> dict[str, object]:
    response = client.get(f"/api/expenses/yearly/{year}")
    assert response.status_code == 200
    return response.json()


def month_totals(body: dict[str, object]) -> dict[int, tuple[int, int]]:
    """月の内訳を {月: (合計, 件数)} にする。0円・0件の月は除く"""
    months = body["months"]
    assert isinstance(months, list)
    return {
        m["month"]: (m["total"], m["count"])
        for m in months
        if m["total"] != 0 or m["count"] != 0
    }


# --- 正常系 ---


def test_returns_zeros_for_year_without_purchases(client: TestClient):
    body = get_year(client, 2026)

    assert body == {
        "year": 2026,
        "total": 0,
        "count": 0,
        "months": [{"month": m, "total": 0, "count": 0} for m in range(1, 13)],
    }


def test_returns_twelve_months_in_order(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2026-05-01", 500)

    body = get_year(client, 2026)

    assert [m["month"] for m in body["months"]] == list(range(1, 13))


def test_sums_amount_and_counts_purchases_per_month(client: TestClient):
    book_id = create_book(client)
    other_id = create_book(client, title="別の本")
    create_purchase(client, book_id, "2026-03-01", 1980)
    create_purchase(client, other_id, "2026-03-31", 880)
    create_purchase(client, book_id, "2026-10-13", 1100)

    body = get_year(client, 2026)

    assert body["total"] == 3960
    assert body["count"] == 3
    assert month_totals(body) == {3: (2860, 2), 10: (1100, 1)}


def test_splits_months_at_month_end(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2026-01-31", 100)
    create_purchase(client, book_id, "2026-02-01", 200)
    create_purchase(client, book_id, "2026-02-28", 300)
    create_purchase(client, book_id, "2026-03-01", 400)

    body = get_year(client, 2026)

    assert month_totals(body) == {1: (100, 1), 2: (500, 2), 3: (400, 1)}


def test_excludes_other_years(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2025-12-31", 1000)
    create_purchase(client, book_id, "2026-01-01", 2000)
    create_purchase(client, book_id, "2026-12-31", 3000)
    create_purchase(client, book_id, "2027-01-01", 4000)

    body = get_year(client, 2026)

    assert body["total"] == 5000
    assert body["count"] == 2
    assert month_totals(body) == {1: (2000, 1), 12: (3000, 1)}


def test_counts_zero_yen_purchase(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2026-03-01", 0)

    body = get_year(client, 2026)

    assert body["count"] == 1
    assert month_totals(body) == {3: (0, 1)}


def test_uses_amount_not_list_price(client: TestClient):
    # create_book は定価を 9999 円にしている
    book_id = create_book(client)
    create_purchase(client, book_id, "2026-03-01", 110)

    assert get_year(client, 2026)["total"] == 110


def test_includes_purchases_of_disposed_book(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2026-03-01", 1500)
    response = client.put(
        f"/api/books/{book_id}/disposal", json={"disposed_on": "2026-09-01"}
    )
    assert response.status_code == 200

    assert month_totals(get_year(client, 2026)) == {3: (1500, 1)}


def test_excludes_purchases_of_deleted_book(client: TestClient):
    book_id = create_book(client)
    deleted_id = create_book(client, title="削除する本")
    create_purchase(client, book_id, "2026-03-01", 1500)
    create_purchase(client, deleted_id, "2026-03-02", 800)
    assert client.delete(f"/api/books/{deleted_id}").status_code == 204

    assert month_totals(get_year(client, 2026)) == {3: (1500, 1)}


@pytest.mark.parametrize("year", [1, 9999])
def test_accepts_min_and_max_year(client: TestClient, year: int):
    assert get_year(client, year)["year"] == year


# --- エラー ---


@pytest.mark.parametrize(
    ("year", "msg"),
    [(0, "年は1以上で入力してください"), (10000, "年は9999以下で入力してください")],
)
def test_year_out_of_range_returns_422(client: TestClient, year: int, msg: str):
    response = client.get(f"/api/expenses/yearly/{year}")

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["path", "year"]
    assert error["msg"] == msg


def test_non_integer_year_returns_422(client: TestClient):
    response = client.get("/api/expenses/yearly/abc")

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["path", "year"]
    assert error["msg"] == "年は整数で入力してください"
