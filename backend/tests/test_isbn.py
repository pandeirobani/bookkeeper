import pytest

from app.isbn import InvalidIsbnError, normalize_isbn


@pytest.mark.parametrize("value", [None, "", "   ", " - "])
def test_empty_value_becomes_none(value: str | None):
    assert normalize_isbn(value) is None


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        # ISBN-13
        ("9784003101018", "9784003101018"),
        ("978-4-00-310101-8", "9784003101018"),
        (" 978 4 00 310101 8 ", "9784003101018"),
        ("９７８−４−００−３１０１０１−８", "9784003101018"),  # 全角
        ("9791012345678", "9791012345678"),  # 979 で始まるISBN
        # ISBN-10 は ISBN-13 に変換する
        ("4003101014", "9784003101018"),
        ("4-04-102200-2", "9784041022009"),
        ("487311778X", "9784873117782"),  # チェックディジットが X
        ("487311778x", "9784873117782"),  # 小文字の x
    ],
)
def test_valid_isbn_is_normalized_to_isbn13(value: str, expected: str):
    assert normalize_isbn(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        "9784003101019",  # ISBN-13 のチェックディジット違い
        "4003101015",  # ISBN-10 のチェックディジット違い
        "4900000000003",  # 978/979 以外で始まる13桁（JANコードなど）
        "978400310101",  # 桁数不足
        "97840031010188",  # 桁数超過
        "97840031010X8",  # ISBN-13 に X
        "X003101014",  # ISBN-10 の末尾以外に X
        "978٤٠٠٣١٠١٠١8",  # アラビア・インド数字（NFKCでも半角にならない）
        "४००३१०१०१4",  # デーヴァナーガリー数字
        "abc",
    ],
)
def test_invalid_isbn_raises_error(value: str):
    with pytest.raises(InvalidIsbnError):
        normalize_isbn(value)


@pytest.mark.parametrize(
    "value",
    [
        "978-4-00-310101-9",  # チェックディジット違い
        "abc",  # 形式違い
    ],
)
def test_error_message_is_user_friendly(value: str):
    with pytest.raises(InvalidIsbnError) as exc_info:
        normalize_isbn(value)

    message = str(exc_info.value)
    assert message == "ISBNが正しくありません。番号に入力ミスがないか確認してください"
    assert "チェックディジット" not in message
    # 入力値は画面の入力欄に見えており、422のレスポンスの input にも含まれるので入れない
    assert value not in message
