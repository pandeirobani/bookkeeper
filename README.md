# bookkeeper
ISBNで登録できる読書管理・書籍費の記録アプリ

## 開発環境の起動

バックエンドとフロントエンドを別々のターミナルで起動する。

```sh
# バックエンド（http://localhost:8000）
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

`uv run alembic upgrade head` は、DB（`backend/bookkeeper.db`）を作り、テーブルを最新の状態にする。
初回のほか、マイグレーションが追加されたとき（`git pull` の後など）にも実行する。最新の状態なら何もしない。

```sh
# フロントエンド（http://localhost:5173）
cd frontend
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開く。開発時は Vite のプロキシにより `/api` へのリクエストがバックエンドに転送される。
画面に「バックエンド：接続OK」と表示されれば疎通できている。

## 書籍の登録
- ISBN は任意。ハイフンや全角数字を含んでもよく、ISBN-10 は ISBN-13 に変換して保存する
- ISBN の末尾の桁（チェックディジット）で入力ミスを検出し、誤りがあれば登録を受け付けない

## テスト

```sh
cd backend && uv run pytest
cd frontend && npm test
```
