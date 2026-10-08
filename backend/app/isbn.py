"""ISBNの正規化。保存時はISBN-13に統一する（docs/db-design.md）"""

import re
import unicodedata

# 入力に混ざりやすい区切り文字（空白・各種ハイフン）
_SEPARATORS = re.compile(r"[\s\-‐‑‒–—―−]")
_ISBN10 = re.compile(r"\d{9}[\dX]")
_ISBN13 = re.compile(r"97[89]\d{10}")

# 利用者向けの文言。形式の誤りでもチェックディジットの誤りでも、
# 利用者がすべきことは「番号を見直す」で同じなので区別しない
_ERROR_MESSAGE = "ISBNが正しくありません。番号に入力ミスがないか確認してください"


class InvalidIsbnError(ValueError):
    """ISBNとして正しくない値"""


def normalize_isbn(value: str | None) -> str | None:
    """ISBNを区切り文字なしのISBN-13に正規化する。

    - None・空文字・空白だけの場合は None を返す
    - 全角数字、ハイフン、空白は許容する
    - ISBN-10 は ISBN-13 に変換する
    - 形式やチェックディジットが正しくない場合は InvalidIsbnError を送出する
    """
    if value is None:
        return None

    isbn = _SEPARATORS.sub("", unicodedata.normalize("NFKC", value)).upper()
    if isbn == "":
        return None

    if _ISBN13.fullmatch(isbn):
        if _isbn13_check_digit(isbn[:12]) != isbn[12]:
            raise InvalidIsbnError(f"{_ERROR_MESSAGE}: {value}")
        return isbn

    if _ISBN10.fullmatch(isbn):
        if _isbn10_check_digit(isbn[:9]) != isbn[9]:
            raise InvalidIsbnError(f"{_ERROR_MESSAGE}: {value}")
        body = "978" + isbn[:9]
        return body + _isbn13_check_digit(body)

    raise InvalidIsbnError(f"{_ERROR_MESSAGE}: {value}")


def _isbn13_check_digit(first12: str) -> str:
    """先頭12桁から ISBN-13 のチェックディジット（末尾の桁）を求める。

    1. 左から1桁目に1、2桁目に3、3桁目に1…と、1と3を交互に掛けて合計する
    2. 「10 - 合計の1の位」がチェックディジット（1の位が0なら0）

    例: 978400310101 → 合計62 → 10 - 2 = 8
    """
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(first12))
    return str((10 - total % 10) % 10)


def _isbn10_check_digit(first9: str) -> str:
    """先頭9桁から ISBN-10 のチェックディジット（末尾の桁）を求める。

    1. 左から1桁目に10、2桁目に9…9桁目に2と、10から順に小さい数を掛けて合計する
    2. 合計に足すと11の倍数になる数がチェックディジット（10になる場合は X）

    例: 487311778 → 合計265 → 265 + 10 = 275 = 11 × 25 なので X
    """
    total = sum(int(d) * (10 - i) for i, d in enumerate(first9))
    check = (11 - total % 11) % 11
    return "X" if check == 10 else str(check)
