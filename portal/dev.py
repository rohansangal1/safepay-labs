"""Local preview of both halves: public/ at / and the gated portal at /portal/.

Uses the same gate as production with an in-memory store and one throwaway researcher, so no
database is needed. Binds to loopback only.
"""

from pathlib import Path

import uvicorn
from fastapi.staticfiles import StaticFiles

from .app import create_app
from .passwords import generate_password, hash_password
from .store import MemoryStore

ROOT = Path(__file__).resolve().parent.parent
DEV_EMAIL = "dev@localhost"


def main() -> None:
    store = MemoryStore()
    password = generate_password()
    store.add(DEV_EMAIL, "Local dev", hash_password(password))
    app = create_app(store, ROOT / "site")
    app.mount("/", StaticFiles(directory=ROOT / "public", html=True))
    print("Public site:  http://127.0.0.1:4173/")
    print("Portal:       http://127.0.0.1:4173/portal/")
    print(f"  username: {DEV_EMAIL}\n  password: {password}  (this run only)")
    uvicorn.run(app, host="127.0.0.1", port=4173, log_level="warning")


if __name__ == "__main__":
    main()
