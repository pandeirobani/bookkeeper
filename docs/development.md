# 開発環境とデータの管理

Docker を使わずに開発するときの手順と、データの保存場所・バックアップをまとめる。Docker での起動は、[README](../README.md) の「Dockerで起動する」を参照。

## ローカルでの開発環境（Docker を使わない場合）

### 前提

- [uv](https://docs.astral.sh/uv/)：Python 3.13 も、uv が自動で用意する
- [Node.js](https://nodejs.org/) 22.12 以上の偶数の版（22・24 など）と npm

コマンドは、リポジトリのルート（README.md のあるディレクトリ）から実行する。バックエンドとフロントエンドのコードブロックは、それぞれ別のターミナルで実行するか、ルートに戻ってから実行する。

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
- サンプルのデータを入れるときは、`backend` で `uv run python -m app.sample_data` を実行する。本が登録されている DB には入れない
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

- Docker で起動したものと同じ DB（`backend/bookkeeper.db`）とポートを使うので、同時に動かさない

### テスト

準備・起動と同じく、リポジトリのルートから実行する。

```sh
# バックエンド
cd backend
uv run pytest
```

```sh
# フロントエンド
cd frontend
npm test -- --run
```

- `npm test` だけだと監視モードで起動し、ファイルを変更するたびにテストを実行し直す。止めるときは `q` か `Ctrl + C` を押す

### 整形・静的解析

コミットの前に通す。テストと同じく、リポジトリのルートから実行する。

```sh
# バックエンド
cd backend
uv run ruff check .
uv run ruff format .
```

```sh
# フロントエンド
cd frontend
npm run lint
npm run typecheck
npm run format
```

- `ruff format` と `npm run format` は、ファイルを書き換えて整形する
- `npm run typecheck` は TypeScript の型をチェックする。`npm run lint` やテスト、`npm run dev` では型の誤りを検出しないため、別に実行する

## データの保存場所とバックアップ

- 登録したデータは、SQLite のファイル `backend/bookkeeper.db` 1つに保存される
  - git の管理対象外（`.gitignore`）なので、commit や push はされない。消すと元に戻せない
- バックアップは、バックエンドを止めてから（Docker では `docker compose down`）、このファイルをコピーする
  - 書き込みの途中でコピーすると、壊れたファイルになることがあるため
- 戻すときは、バックエンドを止めてファイルを置き換えてから起動する
  - Docker では起動時にテーブルが最新の状態になる。Docker を使わない場合は、起動の前に `uv run alembic upgrade head` を実行する
  - バックアップを取った後にテーブルの変更があっても、最新の状態にそろうため
- Docker を使わない場合は、保存場所を環境変数 `DATABASE_URL` で変えられる（Docker では使わず、いつも `backend/bookkeeper.db` を使う）。`uv run alembic upgrade head` と `uv run uvicorn …` の両方を、同じ値を設定したターミナルで実行する

```sh
# macOS・Linux など
export DATABASE_URL=sqlite:////home/me/bookkeeper/bookkeeper.db
```

```powershell
# Windows（PowerShell）
$env:DATABASE_URL = "sqlite:///C:/Users/me/bookkeeper/bookkeeper.db"
```
