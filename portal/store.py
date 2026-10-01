"""Where researcher accounts and failed-attempt counters live.

`PostgresStore` is the real one (Neon, via DATABASE_URL). `MemoryStore` backs the tests and the
local dev server, so neither needs a database.
"""

import os
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

FAILURE_WINDOW_SECONDS = 15 * 60
SCHEMA = Path(__file__).with_name("schema.sql")


@dataclass(frozen=True)
class Researcher:
    email: str
    name: str
    password_hash: str
    disabled: bool
    created_at: datetime
    last_seen_at: datetime | None


def normalize_email(email: str) -> str:
    return email.strip().lower()


class ResearcherStore(Protocol):
    def get(self, email: str) -> Researcher | None: ...
    def all(self) -> list[Researcher]: ...
    def add(self, email: str, name: str, password_hash: str) -> bool: ...
    def set_password(self, email: str, password_hash: str) -> bool: ...
    def set_disabled(self, email: str, disabled: bool) -> bool: ...
    def remove(self, email: str) -> bool: ...
    def touch(self, email: str) -> None: ...
    def failures(self, key: str) -> int: ...
    def record_failure(self, key: str) -> None: ...
    def clear_failures(self, key: str) -> None: ...


class MemoryStore:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._researchers: dict[str, Researcher] = {}
        self._failures: dict[str, tuple[int, float]] = {}
        self._clock = clock

    def get(self, email: str) -> Researcher | None:
        return self._researchers.get(email)

    def all(self) -> list[Researcher]:
        return sorted(self._researchers.values(), key=lambda r: r.email)

    def add(self, email: str, name: str, password_hash: str) -> bool:
        if email in self._researchers:
            return False
        self._researchers[email] = Researcher(
            email, name, password_hash, False, datetime.now(UTC), None
        )
        return True

    def _replace(self, email: str, **changes) -> bool:
        current = self._researchers.get(email)
        if current is None:
            return False
        self._researchers[email] = replace(current, **changes)
        return True

    def set_password(self, email: str, password_hash: str) -> bool:
        return self._replace(email, password_hash=password_hash)

    def set_disabled(self, email: str, disabled: bool) -> bool:
        return self._replace(email, disabled=disabled)

    def remove(self, email: str) -> bool:
        return self._researchers.pop(email, None) is not None

    def touch(self, email: str) -> None:
        self._replace(email, last_seen_at=datetime.now(UTC))

    def failures(self, key: str) -> int:
        count, started = self._failures.get(key, (0, 0.0))
        return count if self._clock() - started < FAILURE_WINDOW_SECONDS else 0

    def record_failure(self, key: str) -> None:
        count = self.failures(key)
        started = self._failures[key][1] if count else self._clock()
        self._failures[key] = (count + 1, started)

    def clear_failures(self, key: str) -> None:
        self._failures.pop(key, None)


class PostgresStore:
    """One connection per warm function instance, opened on first use."""

    _COLUMNS = "email, name, password_hash, disabled, created_at, last_seen_at"
    _WINDOW = f"interval '{FAILURE_WINDOW_SECONDS} seconds'"

    def __init__(self, url: str | None = None) -> None:
        self._url = url or os.environ.get("DATABASE_URL")
        self._conn = None
        self._lock = threading.Lock()

    def _execute(self, sql: str, params: tuple = ()):
        import psycopg  # imported here so tests and the dev server don't need the driver loaded

        if not self._url:
            raise RuntimeError("DATABASE_URL is not set. Run `vercel env pull .env.local` first.")
        with self._lock:
            for attempt in (1, 2):
                try:
                    if self._conn is None or self._conn.closed:
                        self._conn = psycopg.connect(self._url, autocommit=True)
                    return self._conn.execute(sql, params or None)
                except psycopg.OperationalError:
                    # A serverless database drops idle connections; reconnect once.
                    self._conn = None
                    if attempt == 2:
                        raise

    def init_schema(self) -> None:
        self._execute(SCHEMA.read_text())

    def get(self, email: str) -> Researcher | None:
        row = self._execute(
            f"SELECT {self._COLUMNS} FROM researchers WHERE email = %s", (email,)
        ).fetchone()
        return Researcher(*row) if row else None

    def all(self) -> list[Researcher]:
        rows = self._execute(f"SELECT {self._COLUMNS} FROM researchers ORDER BY email").fetchall()
        return [Researcher(*row) for row in rows]

    def add(self, email: str, name: str, password_hash: str) -> bool:
        cur = self._execute(
            "INSERT INTO researchers (email, name, password_hash) VALUES (%s, %s, %s) "
            "ON CONFLICT (email) DO NOTHING",
            (email, name, password_hash),
        )
        return cur.rowcount == 1

    def set_password(self, email: str, password_hash: str) -> bool:
        cur = self._execute(
            "UPDATE researchers SET password_hash = %s WHERE email = %s", (password_hash, email)
        )
        return cur.rowcount == 1

    def set_disabled(self, email: str, disabled: bool) -> bool:
        cur = self._execute(
            "UPDATE researchers SET disabled = %s WHERE email = %s", (disabled, email)
        )
        return cur.rowcount == 1

    def remove(self, email: str) -> bool:
        return self._execute("DELETE FROM researchers WHERE email = %s", (email,)).rowcount == 1

    def touch(self, email: str) -> None:
        self._execute("UPDATE researchers SET last_seen_at = now() WHERE email = %s", (email,))

    def failures(self, key: str) -> int:
        row = self._execute(
            "SELECT count FROM auth_failures "
            f"WHERE key = %s AND window_start > now() - {self._WINDOW}",
            (key,),
        ).fetchone()
        return row[0] if row else 0

    def record_failure(self, key: str) -> None:
        expired = f"auth_failures.window_start <= now() - {self._WINDOW}"
        self._execute(
            "INSERT INTO auth_failures (key, count, window_start) VALUES (%s, 1, now()) "
            "ON CONFLICT (key) DO UPDATE SET "
            f"count = CASE WHEN {expired} THEN 1 ELSE auth_failures.count + 1 END, "
            f"window_start = CASE WHEN {expired} THEN now() ELSE auth_failures.window_start END",
            (key,),
        )

    def clear_failures(self, key: str) -> None:
        self._execute("DELETE FROM auth_failures WHERE key = %s", (key,))
