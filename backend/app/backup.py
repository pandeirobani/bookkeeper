"""DB のバックアップを取る。起動スクリプト（start.ps1）が、起動のたびに呼ぶ

    uv run python -m app.backup

- アプリと同じ DB（DATABASE_URL、なければ backend/bookkeeper.db）を、
  backend/backups/bookkeeper-YYYYMMDD-HHMMSSZ.db に複製する。時刻は UTC
- SQLite のバックアップの機能で複製する。アプリが DB を使っている最中でも、
  書き込みの途中を写さずに、壊れていない複製が取れる
- 新しいものから KEEP 個だけ残し、それより古いものは消す
- DB のファイルがまだないとき（初回の起動の前など）は、何もしない
- 戻すのは手で行う（README を参照）。まれな操作で、間違えると怖いので、自動にはしない
"""

import sqlite3
import sys
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.engine import make_url

from app.database import get_database_url

BACKUP_DIR = Path(__file__).resolve().parent.parent / "backups"
# 残すバックアップの数。起動のたびに1つ増えるので、直近の10回分になる
KEEP = 10
_PREFIX = "bookkeeper-"
_SUFFIX = ".db"


def backup_database(
    database_path: Path,
    backup_dir: Path,
    keep: int = KEEP,
    now: datetime | None = None,
) -> Path | None:
    """database_path を backup_dir に複製し、複製のパスを返す。DB がなければ None"""
    if not database_path.exists():
        return None
    backup_dir.mkdir(parents=True, exist_ok=True)
    # 名前の順が時刻の順になるよう、年から秒までを桁をそろえて並べる
    stamp = (now or datetime.now(UTC)).strftime("%Y%m%d-%H%M%SZ")
    destination = backup_dir / f"{_PREFIX}{stamp}{_SUFFIX}"
    with (
        closing(sqlite3.connect(database_path)) as source,
        closing(sqlite3.connect(destination)) as target,
    ):
        source.backup(target)
    _remove_old_backups(backup_dir, keep)
    return destination


def _remove_old_backups(backup_dir: Path, keep: int) -> None:
    """新しいものから keep 個だけ残す。このモジュールが作った名前のファイルだけを消す"""
    backups = sorted(backup_dir.glob(f"{_PREFIX}*{_SUFFIX}"), reverse=True)
    for old in backups[keep:]:
        old.unlink()


def _database_path() -> Path | None:
    """アプリが使う DB のファイルの場所。SQLite のファイルでなければ None"""
    url = make_url(get_database_url())
    if url.get_backend_name() != "sqlite" or url.database in (None, "", ":memory:"):
        return None
    return Path(url.database)


def main() -> int:
    database_path = _database_path()
    if database_path is None:
        print("SQLite のファイルの DB ではないので、バックアップを取りませんでした")
        return 0
    destination = backup_database(database_path, BACKUP_DIR)
    if destination is None:
        print(f"DB（{database_path}）がまだないので、バックアップを取りませんでした")
    else:
        print(f"DB のバックアップを取りました：backend/backups/{destination.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
