"""年ごとの書籍費の集計API GET /api/expenses/yearly のテスト"""

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


def get_yearly(client: TestClient) -> list[dict[str, int]]:
    response = client.get("/api/expenses/yearly")
    assert response.status_code == 200
    return response.json()


# --- 正常系 ---


def test_returns_empty_list_without_purchases(client: TestClient):
    create_book(client)

    assert get_yearly(client) == []


def test_sums_amount_and_counts_purchases_per_year(client: TestClient):
    book_id = create_book(client)
    other_id = create_book(client, title="別の本")
    create_purchase(client, book_id, "2026-01-10", 1980)
    create_purchase(client, other_id, "2026-10-01", 880)

    assert get_yearly(client) == [{"year": 2026, "total": 2860, "count": 2}]


def test_is_ordered_by_year_desc(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2025-06-01", 500)
    create_purchase(client, book_id, "2026-06-01", 700)
    create_purchase(client, book_id, "2024-06-01", 300)

    assert [row["year"] for row in get_yearly(client)] == [2026, 2025, 2024]


def test_omits_years_without_purchases(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2024-06-01", 300)
    create_purchase(client, book_id, "2026-06-01", 700)

    assert [row["year"] for row in get_yearly(client)] == [2026, 2024]


def test_splits_years_at_new_year(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2025-12-31", 1000)
    create_purchase(client, book_id, "2026-01-01", 2000)

    assert get_yearly(client) == [
        {"year": 2026, "total": 2000, "count": 1},
        {"year": 2025, "total": 1000, "count": 1},
    ]


def test_counts_zero_yen_purchase(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2026-03-01", 0)

    assert get_yearly(client) == [{"year": 2026, "total": 0, "count": 1}]


def test_uses_amount_not_list_price(client: TestClient):
    # create_book は定価を 9999 円にしている
    book_id = create_book(client)
    create_purchase(client, book_id, "2026-03-01", 110)

    assert get_yearly(client)[0]["total"] == 110


def test_includes_purchases_of_disposed_book(client: TestClient):
    book_id = create_book(client)
    create_purchase(client, book_id, "2026-03-01", 1500)
    response = client.put(
        f"/api/books/{book_id}/disposal", json={"disposed_on": "2026-09-01"}
    )
    assert response.status_code == 200

    assert get_yearly(client) == [{"year": 2026, "total": 1500, "count": 1}]


def test_excludes_purchases_of_deleted_book(client: TestClient):
    book_id = create_book(client)
    deleted_id = create_book(client, title="削除する本")
    create_purchase(client, book_id, "2026-03-01", 1500)
    create_purchase(client, deleted_id, "2026-03-02", 800)
    create_purchase(client, deleted_id, "2025-03-02", 600)
    assert client.delete(f"/api/books/{deleted_id}").status_code == 204

    assert get_yearly(client) == [{"year": 2026, "total": 1500, "count": 1}]
