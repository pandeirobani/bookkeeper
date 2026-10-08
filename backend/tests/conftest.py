from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

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
