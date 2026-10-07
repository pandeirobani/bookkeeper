# BookKeeper

ISBNから書誌情報を取得できる読書管理・書籍費の記録アプリ。
就職活動用のポートフォリオで、ローカル環境で完結して動くこと。

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