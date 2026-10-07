# bookkeeper
ISBNで登録できる読書管理・書籍費の記録アプリ

## 開発環境の起動

バックエンドとフロントエンドを別々のターミナルで起動する。

```sh
# バックエンド（http://localhost:8000）
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

```sh
# フロントエンド（http://localhost:5173）
cd frontend
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開く。開発時は Vite のプロキシにより `/api` へのリクエストがバックエンドに転送される。
画面に「バックエンド：接続OK」と表示されれば疎通できている。

## テスト

```sh
cd backend && uv run pytest
cd frontend && npm test
```
