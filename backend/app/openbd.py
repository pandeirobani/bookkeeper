"""openBD の応答を、書籍登録と同じ項目の書誌情報に変換する

変換のしかたは docs/openbd.md の「このアプリでの変換のしかた」に従う。
openBD の値は本によって書き方が違う（表記ゆれ）ので、
項目ごとにどの書き方にも対応させる。
文字数の上限は超えていても切り詰めず、保存のときの検証に任せる。
"""

import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass

from app.schemas import is_http_url

# 名前の後ろに付く生没年（1867-1916、1962-）や、同名の人を区別する印（pub.2011）
_NAME_QUALIFIER = re.compile(r"(?:pub\.)?[0-9]{4}(?:-[0-9]{0,4})?")
# 日本語（ひらがな・カタカナ・漢字）を含む名前は、姓と名を区切らずにつなぐ
_JAPANESE_CHARACTER = re.compile(r"[぀-ヿ㐀-鿿豈-﫿々〆ヶ]")

# 出版日（summary.pubdate）。YYYYMMDD・YYYYMM・YYYY
_PUBDATE = re.compile(r"([0-9]{4})([0-9]{2})?([0-9]{2})?")

# 価格（PriceAmount）の先頭の数字。「410 (税込)」のように後ろに文字が付くことがある
_PRICE_AMOUNT = re.compile(r"\s*([0-9][0-9,]*)")
# 価格の種類（ONIX のコード表 List 58）。税込は 02・04、税抜は 01・03
_TAX_INCLUDED_PRICE_TYPES = {"02", "04"}
_TAX_EXCLUDED_PRICE_TYPES = {"01", "03"}
# 税抜の価格を税込に換算するときの税率（10%）。分数で持ち、整数のまま計算する
_TAX_RATE_NUMERATOR = 11
_TAX_RATE_DENOMINATOR = 10


class OpenBDFormatError(ValueError):
    """openBD の応答の形が想定と違う（必要な値の型が違うなど）"""


@dataclass(frozen=True)
class BookInfo:
    """openBD から取得した書誌情報。取得できなかった項目は None"""

    title: str | None
    author: str | None
    publisher: str | None
    published_date: str | None
    list_price: int | None
    cover_image_url: str | None


def parse_record(record: object) -> BookInfo:
    """openBD の応答1件（配列の要素）を書誌情報にする。

    該当なしの null は呼び出し側で扱い、ここには渡さない。
    形が想定と違う場合は OpenBDFormatError を送出する
    """
    root = _mapping(record, "応答")
    summary = _mapping(root.get("summary"), "summary")
    onix = _optional_mapping(root.get("onix"), "onix")
    descriptive = _optional_mapping(onix.get("DescriptiveDetail"), "DescriptiveDetail")
    product_supply = _optional_mapping(onix.get("ProductSupply"), "ProductSupply")
    supply = _optional_mapping(product_supply.get("SupplyDetail"), "SupplyDetail")

    cover = _optional_text(summary, "cover")
    return BookInfo(
        title=_optional_text(summary, "title"),
        author=_parse_contributors(descriptive.get("Contributor")),
        publisher=_optional_text(summary, "publisher"),
        published_date=_parse_pubdate(_optional_text(summary, "pubdate")),
        list_price=_parse_prices(supply.get("Price")),
        cover_image_url=cover if cover is not None and is_http_url(cover) else None,
    )


# --- 著者 ---


def _parse_contributors(value: object) -> str | None:
    """Contributor の全員の名前をカンマでつなぐ。

    役割（ContributorRole）は空のことが多いので使わず、訳者なども一緒に並べる
    """
    names: list[str] = []
    for index, item in enumerate(_optional_list(value, "Contributor")):
        contributor = _mapping(item, f"Contributor[{index}]")
        person_name = _optional_mapping(
            contributor.get("PersonName"), f"Contributor[{index}].PersonName"
        )
        content = _optional_text(person_name, "content")
        if content is None:
            continue
        name = format_person_name(content)
        if name:
            names.append(name)
    return ",".join(names) or None


def format_person_name(content: str) -> str:
    """openBD の名前を、表示する形に整える。

    - 生没年や区別の印を除く：「夏目, 漱石, 1867-1916」→「夏目, 漱石」
    - 日本語の名前は姓と名をつなぐ：「夏目, 漱石」→「夏目漱石」
      （「平岩 時雄」のような空白も除く）
    - 欧米の名前は名・姓の順にする：「Harari, Yuval N.」→「Yuval N. Harari」
    """
    parts = [
        part.strip()
        for part in content.split(",")
        if part.strip() and not _NAME_QUALIFIER.fullmatch(part.strip())
    ]
    if not parts:
        return ""
    if _JAPANESE_CHARACTER.search("".join(parts)):
        # 全角の空白も区切りとして除く
        return "".join("".join(part.split()) for part in parts)
    family, *given = parts
    return " ".join([*given, family])


# --- 出版日 ---


def _parse_pubdate(value: str | None) -> str | None:
    """YYYYMMDD → YYYY-MM-DD、YYYYMM → YYYY-MM。YYYY やそれ以外の形はそのまま返す"""
    if value is None:
        return None
    match = _PUBDATE.fullmatch(value)
    if match is None:
        return value
    return "-".join(part for part in match.groups() if part is not None)


# --- 定価 ---


def _parse_prices(value: object) -> int | None:
    """Price の中から、税込の定価（円）を求められる最初の価格を返す。なければ None"""
    for index, item in enumerate(_optional_list(value, "Price")):
        price = _mapping(item, f"Price[{index}]")
        currency = _optional_text(price, "CurrencyCode")
        if currency is not None and currency != "JPY":
            continue
        list_price = _to_tax_included_price(
            _optional_text(price, "PriceType"), _optional_text(price, "PriceAmount")
        )
        if list_price is not None:
            return list_price
    return None


def _to_tax_included_price(price_type: str | None, amount: str | None) -> int | None:
    """価格を税込の円にする。

    - 値に「税込」とあるか、PriceType が税込（02・04）なら、数字をそのまま使う
    - PriceType が税抜（01・03）なら、×1.1 して端数を切り捨てる
    - 数字を取り出せない、または税込か税抜かわからない場合は None
    """
    if amount is None:
        return None
    # 全角の数字も読めるようにする
    amount = unicodedata.normalize("NFKC", amount)
    match = _PRICE_AMOUNT.match(amount)
    if match is None:
        return None
    number = int(match.group(1).replace(",", ""))

    if "税込" in amount or price_type in _TAX_INCLUDED_PRICE_TYPES:
        return number
    if price_type in _TAX_EXCLUDED_PRICE_TYPES:
        return number * _TAX_RATE_NUMERATOR // _TAX_RATE_DENOMINATOR
    return None


# --- 応答の形の確認 ---


def _mapping(value: object, where: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise OpenBDFormatError(f"{where} がオブジェクトではありません")
    return value


def _optional_mapping(value: object, where: str) -> Mapping[str, object]:
    """ない（None）場合は空のオブジェクトとして扱う"""
    return {} if value is None else _mapping(value, where)


def _optional_list(value: object, where: str) -> list[object]:
    """ない（None）場合は空の配列として扱う"""
    if value is None:
        return []
    if not isinstance(value, list):
        raise OpenBDFormatError(f"{where} が配列ではありません")
    return value


def _optional_text(mapping: Mapping[str, object], key: str) -> str | None:
    """文字列の値を、前後の空白を除いて返す。ない場合や空文字は None"""
    value = mapping.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise OpenBDFormatError(f"{key} が文字列ではありません")
    return value.strip() or None
