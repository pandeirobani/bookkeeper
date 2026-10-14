"""サンプルのデータを DB に入れる。画面を試すときや、README のスクリーンショット用

    uv run python -m app.sample_data

- アプリと同じ DB（DATABASE_URL、なければ backend/bookkeeper.db）に書き込む。
  テーブルは作らないので、先に alembic upgrade head を実行しておく
- 本が1冊でもある DB には書き込まない。実際のデータにサンプルが混ざるのを防ぐため
- 値は API の入力のスキーマで検証し、API で登録したときと同じ形にする
  （読書記録も1冊に1件作る）
- 日付は実行した日から何日前かで決める。いつ実行しても直近の1年ほどに入るようにするため
"""

import sys
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Book, Purchase, ReadingRecord
from app.schemas import BookCreate, PurchaseCreate, ReadingRecordUpdate


@dataclass(frozen=True)
class SamplePurchase:
    """購入記録。日付は実行した日の何日前か"""

    days_ago: int
    amount: int
    store: str | None = None
    memo: str | None = None


@dataclass(frozen=True)
class SampleBook:
    """サンプルの本1冊と、その読書記録・購入記録"""

    book: BookCreate
    status: Literal["unread", "reading", "finished"]
    started_days_ago: int | None = None
    finished_days_ago: int | None = None
    reading_memo: str | None = None
    # 手放した日。手元にある本は None
    disposed_days_ago: int | None = None
    purchases: tuple[SamplePurchase, ...] = ()


# 書誌情報は docs/openbd.md で調べた実在の本を、アプリの変換の規則で整えた形にする。
# 定価は税込（税抜の価格は ×1.1 して端数を切り捨てる）
SAMPLE_BOOKS: tuple[SampleBook, ...] = (
    SampleBook(
        book=BookCreate(
            isbn="9784003101018",
            title="吾輩は猫である",
            author="夏目漱石",
            publisher="岩波書店",
            published_date="1990-04",
            list_price=410,
        ),
        status="reading",
        started_days_ago=10,
        # 同じ本を2回買った例
        purchases=(
            SamplePurchase(days_ago=280, amount=410, store="近所の書店"),
            SamplePurchase(
                days_ago=20,
                amount=410,
                store="駅前の書店",
                memo="なくしたので買い直した",
            ),
        ),
    ),
    SampleBook(
        book=BookCreate(
            isbn="9784873115658",
            title=(
                "リーダブルコード : "
                "より良いコードを書くためのシンプルで実践的なテクニック"
            ),
            author="Dustin Boswell,Trevor Foucher,角征典",
            publisher="オライリー・ジャパン",
            published_date="2012-06",
            list_price=2640,
        ),
        status="finished",
        started_days_ago=240,
        finished_days_ago=200,
        reading_memo="変数名の付け方の章が特に参考になった",
        purchases=(SamplePurchase(days_ago=250, amount=2640, store="ネット書店"),),
    ),
    SampleBook(
        book=BookCreate(
            isbn="9784798121963",
            title="エリック・エヴァンスのドメイン駆動設計 : ソフトウェア開発の実践",
            author="Eric Evans,今関剛,和智右桂,牧野祐子",
            publisher="翔泳社",
            published_date="2011-04",
            list_price=5720,
        ),
        status="reading",
        started_days_ago=30,
        purchases=(SamplePurchase(days_ago=120, amount=5720, store="ネット書店"),),
    ),
    SampleBook(
        book=BookCreate(
            isbn="9784834000825",
            title="ぐりとぐら",
            author="中川李枝子,大村百合子",
            publisher="福音館書店",
            published_date="1967-01",
        ),
        # 図書館で借りた本の例。購入記録はない
        status="finished",
        started_days_ago=50,
        finished_days_ago=50,
        reading_memo="図書館で借りた",
    ),
    SampleBook(
        book=BookCreate(
            isbn="9784309226712",
            title="サピエンス全史 : 文明の構造と人類の幸福. 上",
            author="Yuval N. Harari,柴田裕之",
            publisher="河出書房新社",
            published_date="2016-09",
            list_price=2090,
        ),
        status="unread",
        purchases=(SamplePurchase(days_ago=15, amount=2090, store="駅前の書店"),),
    ),
    SampleBook(
        book=BookCreate(
            isbn="9784062748681",
            title="ノルウェイの森. 上",
            author="村上春樹",
            publisher="講談社",
            published_date="2004-09",
            list_price=565,
        ),
        # 読み終えて手放した本の例
        status="finished",
        started_days_ago=320,
        finished_days_ago=300,
        disposed_days_ago=90,
        purchases=(
            SamplePurchase(days_ago=330, amount=300, store="古書店", memo="古本"),
        ),
    ),
    SampleBook(
        book=BookCreate(
            isbn="9784274068560",
            title="アジャイルサムライ : 達人開発者への道",
            author="Jonathan Rasmusson,西村直人,角谷信太郎,近藤修平,角掛拓未",
            publisher="オーム社",
            published_date="2011-07",
            list_price=2860,
        ),
        status="unread",
        purchases=(SamplePurchase(days_ago=60, amount=2860, store="ネット書店"),),
    ),
    SampleBook(
        book=BookCreate(
            isbn="9784480683212",
            title="９９％の人が速くなる走り方",
            author="平岩時雄",
            publisher="筑摩書房",
            published_date="2018-05-08",
            list_price=924,
            # openBD に表紙があった本。表示にはインターネットへの接続が要る
            cover_image_url="https://cover.openbd.jp/9784480683212.jpg",
        ),
        status="reading",
        started_days_ago=40,
        reading_memo="フォームの章を読みながら練習している",
        purchases=(SamplePurchase(days_ago=45, amount=924, store="近所の書店"),),
    ),
)


class SampleDataError(Exception):
    """サンプルのデータを入れられない（本がすでに登録されているなど）"""


def _days_before(today: date, days: int | None) -> date | None:
    return None if days is None else today - timedelta(days=days)


def insert_sample_data(session: Session, today: date) -> int:
    """サンプルのデータを入れ、入れた本の冊数を返す。

    本が1冊でもあれば何も書き込まず、SampleDataError を送出する
    """
    if session.scalar(select(func.count()).select_from(Book)):
        raise SampleDataError(
            "本がすでに登録されているため、サンプルのデータは入れません。"
            "空の DB で実行してください"
        )

    for sample in SAMPLE_BOOKS:
        book = Book(
            **sample.book.model_dump(),
            disposed_on=_days_before(today, sample.disposed_days_ago),
        )
        session.add(book)
        session.flush()  # book.id を確定させる

        record = ReadingRecordUpdate(
            status=sample.status,
            started_at=_days_before(today, sample.started_days_ago),
            finished_at=_days_before(today, sample.finished_days_ago),
            memo=sample.reading_memo,
        )
        session.add(ReadingRecord(book_id=book.id, **record.model_dump()))

        for sample_purchase in sample.purchases:
            purchase = PurchaseCreate(
                purchased_on=today - timedelta(days=sample_purchase.days_ago),
                amount=sample_purchase.amount,
                store=sample_purchase.store,
                memo=sample_purchase.memo,
            )
            session.add(Purchase(book_id=book.id, **purchase.model_dump()))

    session.commit()
    return len(SAMPLE_BOOKS)


def main() -> None:
    with SessionLocal() as session:
        try:
            count = insert_sample_data(session, date.today())
        except SampleDataError as error:
            print(error, file=sys.stderr)
            raise SystemExit(1) from error
    print(f"サンプルの本を{count}冊入れました")


if __name__ == "__main__":
    main()
