"""入力エラー（422）のメッセージを日本語にする処理のテスト"""

import pytest
from fastapi.testclient import TestClient

from app.errors import to_japanese_message

PURCHASE = {"purchased_on": "2026-10-01", "amount": 1980}
# チェックディジット（末尾の桁）が誤ったISBN-13
ISBN13_WRONG_CHECK_DIGIT = "9784003101019"


def create_book(client: TestClient) -> int:
    response = client.post("/api/books", json={"title": "テスト書籍"})
    assert response.status_code == 201
    return response.json()["id"]


# --- APIを通した確認 ---


@pytest.mark.parametrize(
    ("payload", "error_type", "loc", "message"),
    [
        ({}, "missing", ["body", "title"], "書名を入力してください"),
        (
            {"title": 1},
            "string_type",
            ["body", "title"],
            "書名は文字列で入力してください",
        ),
        (
            {"title": "テスト書籍", "list_price": "abc"},
            "int_parsing",
            ["body", "list_price"],
            "定価は整数で入力してください",
        ),
        (
            {"title": "テスト書籍", "list_price": 19.8},
            "int_from_float",
            ["body", "list_price"],
            "定価は整数で入力してください",
        ),
        (
            {"title": "テスト書籍", "list_price": -1},
            "greater_than_equal",
            ["body", "list_price"],
            "定価は0以上で入力してください",
        ),
        (
            {"title": "テスト書籍", "list_price": 10_000_001},
            "less_than_equal",
            ["body", "list_price"],
            "定価は10000000以下で入力してください",
        ),
        (
            {"title": "テスト書籍", "x": 1},
            "extra_forbidden",
            ["body", "x"],
            "「x」という項目は受け付けていません",
        ),
        (
            ["テスト書籍"],
            "model_attributes_type",
            ["body"],
            "リクエストの本文はJSONのオブジェクトで送ってください",
        ),
        # バリデーターのメッセージは接頭辞の "Value error, " を取り除く
        (
            {"title": "   "},
            "value_error",
            ["body", "title"],
            "書名を入力してください",
        ),
        (
            {"title": "テスト書籍", "isbn": ISBN13_WRONG_CHECK_DIGIT},
            "value_error",
            ["body", "isbn"],
            "ISBNが正しくありません。番号に入力ミスがないか確認してください",
        ),
        (
            {"title": "あ" * 201},
            "value_error",
            ["body", "title"],
            "書名は200文字以内で入力してください",
        ),
    ],
)
def test_book_errors_are_in_japanese(
    client: TestClient,
    payload: object,
    error_type: str,
    loc: list[str],
    message: str,
):
    response = client.post("/api/books", json=payload)

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["type"] == error_type
    assert error["loc"] == loc
    assert error["msg"] == message


@pytest.mark.parametrize(
    ("purchased_on", "error_type"),
    [
        ("2026/10/01", "date_from_datetime_parsing"),
        ("2026-13-01", "date_from_datetime_parsing"),
        ("2026-10-01T10:00:00", "date_from_datetime_inexact"),
    ],
)
def test_date_errors_are_in_japanese(
    client: TestClient, purchased_on: str, error_type: str
):
    book_id = create_book(client)

    response = client.post(
        f"/api/books/{book_id}/purchases",
        json={**PURCHASE, "purchased_on": purchased_on},
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["type"] == error_type
    assert error["loc"] == ["body", "purchased_on"]
    assert error["msg"] == "購入日はYYYY-MM-DDの形式で入力してください"


def test_missing_fields_are_all_reported_in_japanese(client: TestClient):
    book_id = create_book(client)

    response = client.post(f"/api/books/{book_id}/purchases", json={})

    assert response.status_code == 422
    messages = {tuple(e["loc"]): e["msg"] for e in response.json()["detail"]}
    assert messages == {
        ("body", "purchased_on"): "購入日を入力してください",
        ("body", "amount"): "金額を入力してください",
    }


def test_literal_error_is_in_japanese(client: TestClient):
    book_id = create_book(client)

    response = client.put(
        f"/api/books/{book_id}/reading-record", json={"status": "done"}
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["type"] == "literal_error"
    assert error["loc"] == ["body", "status"]
    assert (
        error["msg"]
        == "読書状態は unread、reading、finished のいずれかを指定してください"
    )


def test_model_validator_error_is_in_japanese(client: TestClient):
    book_id = create_book(client)

    response = client.put(
        f"/api/books/{book_id}/reading-record",
        json={
            "status": "finished",
            "started_at": "2026-10-10",
            "finished_at": "2026-10-09",
        },
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body"]
    assert error["msg"] == "読了日は開始日以降の日付にしてください"


def test_missing_body_is_in_japanese(client: TestClient):
    book_id = create_book(client)

    response = client.put(f"/api/books/{book_id}/disposal")

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["type"] == "missing"
    assert error["loc"] == ["body"]
    assert error["msg"] == "リクエストの本文がありません"


def test_invalid_json_is_in_japanese(client: TestClient):
    response = client.post(
        "/api/books",
        content=b"{bad",
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["type"] == "json_invalid"
    assert error["msg"] == "リクエストの本文がJSONとして正しくありません"


@pytest.mark.parametrize(
    ("path", "error_type", "message"),
    [
        ("/api/books/abc", "int_parsing", "本のIDは整数で入力してください"),
        (
            "/api/books/9223372036854775808",
            "less_than_equal",
            "本のIDは9223372036854775807以下で入力してください",
        ),
        ("/api/purchases/abc", "int_parsing", "購入記録のIDは整数で入力してください"),
    ],
)
def test_path_errors_are_in_japanese(
    client: TestClient, path: str, error_type: str, message: str
):
    response = client.delete(path)

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["type"] == error_type
    assert error["loc"][0] == "path"
    assert error["msg"] == message


def test_other_fields_of_error_are_kept(client: TestClient):
    # msg 以外はFastAPI標準のまま返す
    response = client.post("/api/books", json={"title": "テスト書籍", "list_price": -1})

    [error] = response.json()["detail"]
    assert error["input"] == -1
    assert error["ctx"] == {"ge": 0}


def test_invalid_isbn_input_is_returned_as_entered(client: TestClient):
    # メッセージには入力値を入れないので、画面で必要なら input から取る
    # 正規化前の形（ハイフン入り）のまま返ることを確かめるため、ハイフン入りで送る
    isbn = "978-4-00-310101-9"
    response = client.post("/api/books", json={"title": "テスト書籍", "isbn": isbn})

    [error] = response.json()["detail"]
    assert error["input"] == isbn
    assert isbn not in error["msg"]


# --- 対応表にないエラー（関数を直接呼んで確認） ---


def test_unknown_error_type_with_field():
    error = {"type": "bool_type", "loc": ("body", "amount"), "msg": "英語"}

    assert to_japanese_message(error) == "金額の値が正しくありません"


def test_unknown_error_type_without_field():
    error = {"type": "bool_type", "loc": ("body",), "msg": "英語"}

    assert to_japanese_message(error) == "入力値が正しくありません"


def test_field_not_in_labels_uses_field_name():
    error = {"type": "missing", "loc": ("query", "page"), "msg": "英語"}

    assert to_japanese_message(error) == "pageを入力してください"
