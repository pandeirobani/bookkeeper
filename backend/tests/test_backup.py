"""DB のバックアップ（app/backup.py）のテスト"""

import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.backup import backup_database


def create_database(path: Path, title: str) -> None:
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("CREATE TABLE books (title TEXT)")
        connection.execute("INSERT INTO books VALUES (?)", (title,))
        connection.commit()


def read_titles(path: Path) -> list[str]:
    with closing(sqlite3.connect(path)) as connection:
        return [row[0] for row in connection.execute("SELECT title FROM books")]


def test_copies_database_with_timestamp(tmp_path: Path) -> None:
    database = tmp_path / "bookkeeper.db"
    create_database(database, "本")

    destination = backup_database(
        database, tmp_path / "backups", now=datetime(2026, 11, 1, 5, 6, 7, tzinfo=UTC)
    )

    assert destination == tmp_path / "backups" / "bookkeeper-20261101-050607Z.db"
    assert read_titles(destination) == ["本"]


def test_copy_does_not_change_when_original_changes(tmp_path: Path) -> None:
    database = tmp_path / "bookkeeper.db"
    create_database(database, "本")
    destination = backup_database(database, tmp_path / "backups")
    assert destination is not None

    with closing(sqlite3.connect(database)) as connection:
        connection.execute("DELETE FROM books")
        connection.commit()

    assert read_titles(destination) == ["本"]


def test_keeps_only_newest_backups(tmp_path: Path) -> None:
    database = tmp_path / "bookkeeper.db"
    create_database(database, "本")
    backup_dir = tmp_path / "backups"
    # バックアップ以外のファイルは消さない
    (backup_dir / "memo.txt").parent.mkdir()
    (backup_dir / "memo.txt").write_text("消さない", encoding="utf-8")
    start = datetime(2026, 11, 1, tzinfo=UTC)

    for minutes in range(4):
        backup_database(
            database, backup_dir, keep=3, now=start + timedelta(minutes=minutes)
        )

    assert sorted(p.name for p in backup_dir.iterdir()) == [
        "bookkeeper-20261101-000100Z.db",
        "bookkeeper-20261101-000200Z.db",
        "bookkeeper-20261101-000300Z.db",
        "memo.txt",
    ]


def test_does_nothing_without_database(tmp_path: Path) -> None:
    backup_dir = tmp_path / "backups"

    assert backup_database(tmp_path / "bookkeeper.db", backup_dir) is None
    assert not backup_dir.exists()
