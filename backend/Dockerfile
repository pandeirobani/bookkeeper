# 開発用のバックエンド。ソースは docker-compose.yml で /app にマウントする
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

# 仮想環境はマウントの外に置き、ホストの backend/.venv（Windows 用など）とぶつからないようにする。
# uv.lock のとおりに入れ、lock は書き換えない。Python はイメージのものを使い、ダウンロードしない
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_FROZEN=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy

WORKDIR /app

# 依存関係だけを先に入れ、ソースの変更でこの層を作り直さないようにする
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --no-install-project

EXPOSE 8000

# DB のテーブルを最新にしてから起動する。--reload で app/ の変更をすぐ反映する
CMD ["sh", "-c", "uv run alembic upgrade head && exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app"]
