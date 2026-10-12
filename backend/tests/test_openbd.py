"""openBD の応答の変換（app/openbd.py）のテスト

tests/data/openbd/ には、2026-10-12 に openBD から取得した
実際の応答を1件ずつ置いている。
変換のしかたは docs/openbd.md の「このアプリでの変換のしかた」を参照
"""

import json
from pathlib import Path

import pytest

from app.openbd import BookInfo, OpenBDFormatError, format_person_name, parse_record

DATA_DIR = Path(__file__).resolve().parent / "data" / "openbd"


def load_record(isbn: str) -> object:
    return json.loads((DATA_DIR / f"{isbn}.json").read_text(encoding="utf-8"))


def make_record(
    summary: dict[str, object] | None = None,
    contributors: list[object] | None = None,
    prices: list[object] | None = None,
) -> dict[str, object]:
    """必要な部分だけを持つ応答1件を作る"""
    return {
        "summary": summary if summary is not None else {"title": "テスト書籍"},
        "onix": {
            "DescriptiveDetail": {"Contributor": contributors or []},
            "ProductSupply": {"SupplyDetail": {"Price": prices or []}},
        },
    }


def price(price_type: str, amount: str, currency: str = "JPY") -> dict[str, str]:
    return {"PriceType": price_type, "CurrencyCode": currency, "PriceAmount": amount}


# --- 実際の応答 ---


def test_parse_record_with_family_given_and_years():
    """よくある書き方：著者は「姓, 名, 生没年」、出版日は年月、価格は税抜（01）"""
    assert parse_record(load_record("9784101010014")) == BookInfo(
        title="吾輩は猫である",
        author="夏目漱石",
        publisher="新潮社",
        published_date="2003-06",
        list_price=691,  # 629 × 1.1 = 691.9 の切り捨て
        cover_image_url=None,
    )


def test_parse_record_with_tax_included_amount():
    """PriceType は税抜（01）でも、値に「税込」とあれば数字をそのまま使う"""
    info = parse_record(load_record("9784003101018"))

    assert info.list_price == 410
    assert info.published_date == "1990-04"


def test_parse_record_with_western_names_and_translator():
    """欧米の名前は名・姓の順にする。訳者も著者と一緒に並べる"""
    info = parse_record(load_record("9784873115658"))

    assert info.author == "Dustin Boswell,Trevor Foucher,角征典"
    assert info.publisher == "オーム社"
    assert info.list_price == 2640  # 2400 × 1.1


def test_parse_record_without_price():
    info = parse_record(load_record("9784834000825"))

    assert info.title == "ぐりとぐら"
    assert info.author == "中川李枝子,大村百合子"
    assert info.list_price is None


def test_parse_record_registered_by_publisher():
    """出版社が登録したとみられる書き方。

    著者は「姓 名」、出版日は年月日、価格は税抜の定価（03）で、表紙がある
    """
    assert parse_record(load_record("9784480683212")) == BookInfo(
        title="９９％の人が速くなる走り方",
        author="平岩時雄",
        publisher="筑摩書房",
        published_date="2018-05-08",
        list_price=924,  # 840 × 1.1
        cover_image_url="https://cover.openbd.jp/9784480683212.jpg",
    )


# --- 著者の名前 ---


@pytest.mark.parametrize(
    ("content", "expected"),
    [
        ("夏目, 漱石, 1867-1916", "夏目漱石"),
        ("尾田, 栄一郎, 1975-", "尾田栄一郎"),
        ("西村, 直人, pub.2011", "西村直人"),
        ("平岩 時雄", "平岩時雄"),
        ("平岩　時雄", "平岩時雄"),  # 全角の空白
        ("火海坂, 猫", "火海坂猫"),
        ("佐々木, 小次郎", "佐々木小次郎"),
        ("ヤマザキ, マリ", "ヤマザキマリ"),
        ("さくら, ももこ", "さくらももこ"),
        ("Harari, Yuval N., 1976-", "Yuval N. Harari"),
        ("Boswell, Dustin", "Dustin Boswell"),
        ("Dustin Boswell", "Dustin Boswell"),
        ("KADOKAWA", "KADOKAWA"),
        ("  夏目 ,  漱石  ", "夏目漱石"),
        ("1867-1916", ""),
    ],
)
def test_format_person_name(content: str, expected: str):
    assert format_person_name(content) == expected


def test_author_skips_contributors_without_name():
    record = make_record(
        contributors=[
            {"PersonName": {"content": "夏目, 漱石"}},
            {"ContributorRole": ["A01"]},  # PersonName がない
            {"PersonName": {"content": ""}},
            {"PersonName": {"content": "1867-1916"}},  # 除くと何も残らない
        ]
    )

    assert parse_record(record).author == "夏目漱石"


def test_author_is_none_without_contributors():
    assert parse_record(make_record(contributors=[])).author is None


# --- 出版日 ---


@pytest.mark.parametrize(
    ("pubdate", "expected"),
    [
        ("20180508", "2018-05-08"),
        ("199004", "1990-04"),
        ("1990", "1990"),
        # 想定していない形は、利用者が直せるようそのまま返す
        ("1990.4", "1990.4"),
        ("", None),
    ],
)
def test_published_date(pubdate: str, expected: str | None):
    record = make_record(summary={"title": "テスト書籍", "pubdate": pubdate})

    assert parse_record(record).published_date == expected


# --- 定価 ---


@pytest.mark.parametrize(
    ("prices", "expected"),
    [
        # 税抜（01・03）は ×1.1 して端数を切り捨てる
        ([price("01", "2400")], 2640),
        ([price("03", "629")], 691),
        # 税込（02・04）はそのまま
        ([price("02", "2640")], 2640),
        ([price("04", "691")], 691),
        # 値に「税込」とあれば PriceType より優先する
        ([price("01", "410 (税込)")], 410),
        ([price("01", "410円 (税込)")], 410),
        # 数字の書き方のゆれ
        ([price("01", "1,000")], 1100),
        ([price("01", "１０００")], 1100),
        # 税込か税抜かわからない
        ([price("05", "1000")], None),
        ([{"CurrencyCode": "JPY", "PriceAmount": "1000"}], None),
        # 数字がない
        ([price("01", "未定")], None),
        ([price("01", "")], None),
        ([{"PriceType": "01", "CurrencyCode": "JPY"}], None),
        # 円以外は使わず、次の価格を見る
        ([price("01", "20", currency="USD"), price("01", "1000")], 1100),
        # 通貨がなければ円とみなす
        ([{"PriceType": "01", "PriceAmount": "1000"}], 1100),
        # 使えない価格は飛ばして、次の価格を見る
        ([price("01", "未定"), price("02", "1100")], 1100),
        ([], None),
    ],
)
def test_list_price(prices: list[object], expected: int | None):
    assert parse_record(make_record(prices=prices)).list_price == expected


# --- 表紙 ---


@pytest.mark.parametrize(
    ("cover", "expected"),
    [
        (
            "https://cover.openbd.jp/9784480683212.jpg",
            "https://cover.openbd.jp/9784480683212.jpg",
        ),
        ("http://example.com/cover.jpg", "http://example.com/cover.jpg"),
        ("", None),
        ("javascript:alert(1)", None),
        ("/cover.jpg", None),
    ],
)
def test_cover_image_url(cover: str, expected: str | None):
    record = make_record(summary={"title": "テスト書籍", "cover": cover})

    assert parse_record(record).cover_image_url == expected


# --- 項目がない場合 ---


def test_missing_items_become_none():
    """summary だけで onix がない場合も、取れる項目だけを返す"""
    assert parse_record({"summary": {}}) == BookInfo(
        title=None,
        author=None,
        publisher=None,
        published_date=None,
        list_price=None,
        cover_image_url=None,
    )


def test_text_is_stripped():
    record = make_record(summary={"title": "  吾輩は猫である  ", "publisher": " "})

    info = parse_record(record)
    assert info.title == "吾輩は猫である"
    assert info.publisher is None


# --- 応答の形が想定と違う ---


@pytest.mark.parametrize(
    "record",
    [
        [],
        "吾輩は猫である",
        {},  # summary がない
        {"summary": []},
        {"summary": {"title": 123}},
        {"summary": {}, "onix": []},
        {"summary": {}, "onix": {"DescriptiveDetail": {"Contributor": {}}}},
        {"summary": {}, "onix": {"DescriptiveDetail": {"Contributor": ["夏目漱石"]}}},
        {
            "summary": {},
            "onix": {
                "DescriptiveDetail": {"Contributor": [{"PersonName": "夏目漱石"}]}
            },
        },
        {
            "summary": {},
            "onix": {
                "ProductSupply": {"SupplyDetail": {"Price": [{"PriceAmount": 1000}]}}
            },
        },
    ],
)
def test_unexpected_format_raises_error(record: object):
    with pytest.raises(OpenBDFormatError):
        parse_record(record)
