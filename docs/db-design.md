# BookKeeper テーブル設計

## 前提
- DB: SQLite（ローカルで動かすため）
- 利用者は1人を想定（ユーザーテーブルは作らない）

## books（書誌情報）
ISBNからの自動取得、または手動入力で登録する。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | INTEGER | PK, AUTOINCREMENT | |
| isbn | TEXT | UNIQUE | ISBN-13で統一して保存。ISBNのない本はNULL |
| title | TEXT | NOT NULL | |
| author | TEXT | | 複数著者はカンマ区切り |
| publisher | TEXT | | |
| published_date | TEXT | | API側の形式がまちまちなので文字列 |
| list_price | INTEGER | CHECK (list_price >= 0) | 定価（税込・円）。参考情報。取得できない場合はNULL |
| cover_image_url | TEXT | | |
| created_at | DATETIME | NOT NULL | |

## purchases（購入記録）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | INTEGER | PK, AUTOINCREMENT | |
| book_id | INTEGER | FK → books.id, NOT NULL, ON DELETE RESTRICT | |
| purchased_on | DATE | NOT NULL | 購入日。月別集計に使う |
| amount | INTEGER | NOT NULL, CHECK (amount >= 0) | 実際に支払った金額（税込・円） |
| store | TEXT | | 購入店（任意） |
| memo | TEXT | | |
| created_at | DATETIME | NOT NULL | |

インデックス: purchased_on, book_id

## reading_records（読書記録）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | INTEGER | PK | |
| book_id | INTEGER | FK → books.id, NOT NULL, UNIQUE | 1冊につき1記録 |
| status | TEXT | NOT NULL, 'unread' / 'reading' / 'finished' | |
| started_at | DATE | | |
| finished_at | DATE | | |
| memo | TEXT | | |

## リレーション
- books 1 : 1 reading_records
- books 1 : 0..N purchases

## 設計判断のメモ
- 書誌情報と読書記録を分けたのは、APIから再取得しても自分の記録が消えないようにするため
- 価格は円単位の整数で保存する（小数の丸め誤差を避けるため）
- 価格はAPIで取得できないことがあるためNULLを許可する
- 書籍費は purchases.amount で集計する。books.list_price は定価で、実際の支払額とは一致しないため集計には使わない
- 同じ本を複数回買うことがあるため、購入記録は books と 1:N で分けた
- 図書館で借りた本やもらった本も登録できるよう、購入記録が0件の本を許可する
- 購入記録がある本は削除できない（ON DELETE RESTRICT）。書籍費の履歴が意図せず消えるのを防ぐため
  - SQLiteでは接続ごとに `PRAGMA foreign_keys=ON` を設定しないと外部キー制約が効かない点に注意
- ISBNのない本（同人誌・古い本など）を手動で登録できるよう、isbn はNULLを許可する
  - SQLiteのUNIQUE制約は複数のNULLを許すため、ISBNのない本が複数あっても問題ない
  - 空文字はNULLに変換して保存する（空文字同士がUNIQUE違反になるのを防ぐため）
