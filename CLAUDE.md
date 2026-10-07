# BookKeeper

ISBNから書籍情報を取得できる読書管理・書籍費の記録アプリ。
ISBNから書籍情報を取得するとき以外は、ローカル環境で完結して動くこと。
ネットにつながっていなくても、書籍情報を手動入力することで利用できる。

## 技術スタック
- バックエンド：Python / FastAPI / SQLAlchemy / Alembic / SQLite
- 依存関係管理：uv
- フロントエンド：React / TypeScript / Vite
- パッケージ管理（フロントエンド）：npm
- テスト：pytest、Vitest + Testing Library

## ディレクトリ構成
- backend/：FastAPI アプリ
- frontend/：React アプリ

## ルール
- 型ヒントを必ず付ける。TypeScript では any を使わない
- 新しい機能には必ずテストを書く
- 外部APIを呼ぶ処理はテストでモックに差し替える
- 実装前に作業計画を提示し、承認を得てから実装する
- 変更は小さな単位で行う
- コミット前に整形・静的解析を通す
  - backend：`uv run ruff check .` / `uv run ruff format .`
  - frontend：`npm run lint` / `npm run format`
