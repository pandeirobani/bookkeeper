"""入力エラー（422）のメッセージを日本語にする

画面には msg をそのまま表示できるよう、エラーメッセージはここで日本語にそろえる。
レスポンスの形と type・loc はFastAPI標準のままにし、msg だけを置き換える。
"""

from collections.abc import Mapping, Sequence
from typing import cast

from fastapi import Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# 項目名の日本語。ここにない項目は項目名をそのまま使う
FIELD_LABELS = {
    # books
    "isbn": "ISBN",
    "title": "書名",
    "author": "著者",
    "publisher": "出版社",
    "published_date": "出版日",
    "list_price": "定価",
    "cover_image_url": "表紙画像のURL",
    "disposed_on": "手放した日",
    # purchases
    "purchased_on": "購入日",
    "amount": "金額",
    "store": "購入店",
    "memo": "メモ",
    # reading_records
    "status": "読書状態",
    "started_at": "開始日",
    "finished_at": "読了日",
    # パスのID
    "book_id": "本のID",
    "purchase_id": "購入記録のID",
}

_INT_TYPES = {"int_type", "int_parsing", "int_parsing_size", "int_from_float"}

# バリデーターで raise した ValueError のメッセージに Pydantic が付ける接頭辞
_VALUE_ERROR_PREFIX = "Value error, "


def _field_label(loc: Sequence[object]) -> str | None:
    """loc から項目の日本語名を返す。本文全体のエラーなど項目がない場合は None"""
    # loc は ("body", "title") や ("path", "book_id") の形。
    # ("body",) は本文全体、("body", 1) はJSONの位置を表す
    if len(loc) < 2 or not isinstance(loc[-1], str):
        return None
    return FIELD_LABELS.get(loc[-1], loc[-1])


def to_japanese_message(error: Mapping[str, object]) -> str:
    """Pydanticのエラー1件を日本語のメッセージにする"""
    error_type = str(error["type"])
    loc = cast(Sequence[object], error["loc"])
    ctx = cast(Mapping[str, object], error.get("ctx") or {})

    # バリデーターのメッセージはすでに日本語なので、接頭辞だけ取り除く
    if error_type == "value_error":
        return str(error["msg"]).removeprefix(_VALUE_ERROR_PREFIX)
    if error_type == "json_invalid":
        return "リクエストの本文がJSONとして正しくありません"
    if error_type == "model_attributes_type":
        return "リクエストの本文はJSONのオブジェクトで送ってください"
    if error_type == "extra_forbidden":
        return f"「{loc[-1]}」という項目は受け付けていません"

    label = _field_label(loc)
    if label is None:
        if error_type == "missing":
            return "リクエストの本文がありません"
        return "入力値が正しくありません"

    if error_type == "missing":
        return f"{label}を入力してください"
    if error_type == "string_type":
        return f"{label}は文字列で入力してください"
    if error_type in _INT_TYPES:
        return f"{label}は整数で入力してください"
    if error_type == "greater_than_equal":
        return f"{label}は{ctx['ge']}以上で入力してください"
    if error_type == "less_than_equal":
        return f"{label}は{ctx['le']}以下で入力してください"
    if error_type.startswith("date_"):
        return f"{label}はYYYY-MM-DDの形式で入力してください"
    if error_type == "literal_error":
        # ctx["expected"] は "'unread', 'reading' or 'finished'" の形
        choices = (
            str(ctx["expected"])
            .replace("'", "")
            .replace(" or ", "、")
            .replace(", ", "、")
        )
        return f"{label}は {choices} のいずれかを指定してください"
    return f"{label}の値が正しくありません"


async def request_validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """FastAPI標準の422のレスポンスの msg を日本語に置き換える"""
    errors = [{**error, "msg": to_japanese_message(error)} for error in exc.errors()]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": jsonable_encoder(errors)},
    )
