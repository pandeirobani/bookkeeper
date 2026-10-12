from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.database import get_session
from app.main import app
from app.openbd import get_openbd_client

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


@pytest.fixture
def db_url(tmp_path: Path) -> str:
    return f"sqlite:///{(tmp_path / 'test.db').as_posix()}"


@pytest.fixture
def alembic_config(db_url: str) -> Config:
    """一時DBを対象にしたAlembicの設定"""
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", db_url)
    return config


@pytest.fixture
def engine(db_url: str, alembic_config: Config) -> Iterator[Engine]:
    """マイグレーションを適用した一時DB"""
    command.upgrade(alembic_config, "head")
    engine = create_engine(db_url)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def _fail_on_openbd_request(request: httpx.Request) -> httpx.Response:
    raise AssertionError(f"テストから本物の openBD を呼ぼうとしました: {request.url}")


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    """DBを一時DBに差し替えたテストクライアント。

    openBD のクライアントも、呼ばれたらテストを失敗させるものに差し替える。
    openBD の応答が要るテストでは、改めてモックに差し替える
    """

    def override_get_session() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    def override_get_openbd_client() -> Iterator[httpx.Client]:
        transport = httpx.MockTransport(_fail_on_openbd_request)
        with httpx.Client(transport=transport) as openbd_client:
            yield openbd_client

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_openbd_client] = override_get_openbd_client
    yield TestClient(app)
    app.dependency_overrides.clear()
