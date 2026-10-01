"""Vercel Function entry for the researcher portal. All logic lives in portal/app.py."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from portal.app import create_app  # noqa: E402
from portal.store import PostgresStore  # noqa: E402

app = create_app(PostgresStore(), ROOT / "site")
