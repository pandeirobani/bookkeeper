"""APIのエラーレスポンス

APIのエラーは、ステータスコードによらず常に次の形で返す。
画面はどのエラーでも detail[].msg を表示すればよく、loc で項目の横に出せる。

    {"detail": [{"type": "...", "loc": ["body", "isbn"], "msg": "日本語", ...}]}

- 入力エラー（422）：FastAPI標準の形のまま、msg だけを日本語に置き換える
- アプリが出すエラー（404・409など）：api_error で同じ形にする
- FastAPI・Starletteが出すエラー（存在しないURLなど）：http_exception_handler で包む
"""

from collections.abc import Mapping, Sequence
from typing import cast

from fastapi import HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

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


def api_error(
    status_code: int,
    error_type: str,
    loc: Sequence[str],
    msg: str,
    ctx: Mapping[str, object] | None = None,
) -> HTTPException:
    """アプリが出すエラーを、入力エラー（422）と同じ形の HTTPException にする。

    ctx には、画面で使える補足情報を入れる（例: 重複した本のID）
    """
    error: dict[str, object] = {"type": error_type, "loc": list(loc), "msg": msg}
    if ctx is not None:
        error["ctx"] = dict(ctx)
    return HTTPException(status_code=status_code, detail=[error])


# FastAPI・Starletteが出すエラーの英語のメッセージの日本語。
# ここにないステータスは、元のメッセージをそのまま使う
_HTTP_ERROR_MESSAGES = {
    status.HTTP_404_NOT_FOUND: "指定したURLは見つかりません",
    status.HTTP_405_METHOD_NOT_ALLOWED: "このURLでは、このメソッドは使えません",
}


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """detail が文字列のエラーを、api_error と同じ配列の形に包む。

    api_error で作ったエラーは detail がすでに配列なので、そのまま返す
    """
    if isinstance(exc.detail, list):
        detail: object = exc.detail
    else:
        msg = _HTTP_ERROR_MESSAGES.get(exc.status_code, str(exc.detail))
        detail = [{"type": "http_error", "loc": [], "msg": msg}]
    # 405 の Allow ヘッダーなど、エラーに付いたヘッダーは残す
    return JSONResponse(
        status_code=exc.status_code, content={"detail": detail}, headers=exc.headers
    )


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

    # 必須の項目に null が届くと、Pydantic は型の誤り（int_type など）にする。
    # 画面は空欄を null で送ることがあるので、型の誤りではなく未入力として伝える
    if error_type == "missing" or ("input" in error and error["input"] is None):
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
