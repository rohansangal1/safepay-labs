"""Local preview of both halves: public/ at / and the gated portal at /devs/.

Uses the same gate as production with an in-memory store and one fixed local login, so no
database is needed and the browser can remember the password. Binds to loopback only.
"""

from pathlib import Path

import uvicorn
from fastapi.staticfiles import StaticFiles

from .app import create_app
from .passwords import hash_password
from .store import MemoryStore

ROOT = Path(__file__).resolve().parent.parent
DEV_EMAIL = "dev@localhost"
DEV_PASSWORD = "localdev"  # only ever checked by this loopback server


def main() -> None:
    store = MemoryStore()
    store.add(DEV_EMAIL, "Local dev", hash_password(DEV_PASSWORD))
    store.set_admin(DEV_EMAIL, True)  # so /devs/admin can be tried locally
    # Plain http on loopback, so the session cookie cannot carry the Secure flag here.
    hint = (
        f"Local server. Sign in with <code>{DEV_EMAIL}</code> and <code>{DEV_PASSWORD}</code>. "
        "Real accounts only work on the deployed site."
    )
    app = create_app(store, ROOT / "site", secure_cookies=False, sign_in_hint=hint)
    app.mount("/", StaticFiles(directory=ROOT / "public", html=True))
    print("Public site:  http://127.0.0.1:4173/")
    print("Dev portal:   http://127.0.0.1:4173/devs/")
    print("Admin page:   http://127.0.0.1:4173/devs/admin")
    print(f"  email:    {DEV_EMAIL}\n  password: {DEV_PASSWORD}")
    print("Local only. Sign in again after restarting this server.")
    uvicorn.run(app, host="127.0.0.1", port=4173, log_level="warning")


if __name__ == "__main__":
    main()
