# bookkeeper
ISBNで登録できる読書管理・書籍費の記録アプリ

## 開発環境の起動

### 1. 準備（初回とgit pullの後）

依存関係を入れ、DBのテーブルを最新の状態にする。すでに最新なら何もしないので、迷ったら実行してよい。

```sh
# バックエンド
cd backend
uv sync
uv run alembic upgrade head
```

```sh
# フロントエンド
cd frontend
npm install
```

- `uv run alembic upgrade head` は、DB（`backend/bookkeeper.db`）を作り、テーブルを最新の状態にする
- `uv sync` は省いてもよい。`uv run` が実行のたびに、足りない依存関係を自動で入れる
- `npm install` は省けない。依存関係が足りないまま起動すると、`Failed to resolve import` のエラーになる

### 2. 起動

バックエンドとフロントエンドを別々のターミナルで起動する。止めるときは、それぞれ `Ctrl + C` を押す。

```sh
# バックエンド（http://localhost:8000）
cd backend
uv run uvicorn app.main:app --reload
```

```sh
# フロントエンド（http://localhost:5173）
cd frontend
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
