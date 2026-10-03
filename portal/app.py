"""The researcher gate: a sign-in form at /devs/, then a long-lived session cookie.
Admins also get /devs/admin, where accounts are managed.

site/ is not part of the public static output, so this handler is the only way to reach it.
Without a valid session the page at /devs/ is the sign-in form and every other file is refused.
"""

import hashlib
import hmac
import secrets
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    RedirectResponse,
    Response,
)

from . import accounts
from .admin import ADMIN_CONFIRM_HOURS, csrf_token, render_admin, render_confirm
from .passwords import burn_verification, hash_password, needs_rehash, verify_password
from .store import ResearcherStore, normalize_email

PREFIX = "/devs"  # public address of the portal; vercel.json rewrites it to this function
COOKIE = "pil_session"
SESSION_DAYS = 90  # renewed on use, so an active researcher signs in once per browser
MAX_FAILURES = 10  # per email and per client address, within FAILURE_WINDOW_SECONDS
VERIFIED_TTL_SECONDS = 60  # how long a warm instance trusts a session it has just checked
MAX_FORM_BYTES = 4096

SIGN_IN_PAGE = Path(__file__).with_name("signin.html").read_text()

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}

PORTAL_HEADERS = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    # Not "no-referrer": that makes browsers send `Origin: null` on our own form posts, which the
    # same-origin check below would refuse. "same-origin" still tells other sites nothing.
    "Referrer-Policy": "same-origin",
    # The portal renders chart bars with inline style attributes. Fonts and the favicon are
    # same-origin files under the public /assets/.
    "Content-Security-Policy": (
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    ),
}


def load_files(site_dir: Path) -> dict[str, tuple[bytes, str]]:
    """Read every servable file under site/ once. Requests are answered from this map, so a
    request path is only ever a dictionary key and never reaches the filesystem."""
    files = {}
    for path in sorted(site_dir.rglob("*")):
        content_type = CONTENT_TYPES.get(path.suffix)
        if path.is_file() and content_type:
            files[path.relative_to(site_dir).as_posix()] = (path.read_bytes(), content_type)
    return files


def token_hash(token: str) -> str:
    """Only this hash is stored, so a copy of the database cannot be used to sign in."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_app(
    store: ResearcherStore,
    site_dir: Path,
    clock: Callable[[], float] = time.monotonic,
    today: Callable[[], datetime] = lambda: datetime.now(UTC),
    secure_cookies: bool = True,
    sign_in_hint: str = "",
) -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    files = load_files(site_dir)
    verified: dict[str, float] = {}  # session hash -> when this instance must re-check it

    def failure_key(kind: str, value: str) -> str:
        return hashlib.sha256(f"{kind}:{value}".encode()).hexdigest()

    def client_address(request: Request) -> str:
        # Vercel sets x-forwarded-for itself; the first entry is the client.
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        return forwarded or (request.client.host if request.client else "unknown")

    def sign_in_page(message: str = "", status_code: int = 401) -> Response:
        notice = f'<p class="error" role="alert">{message}</p>' if message else ""
        if sign_in_hint:  # only the local dev server sets this
            notice += f'<p class="local">{sign_in_hint}</p>'
        return HTMLResponse(SIGN_IN_PAGE.replace("<!--message-->", notice), status_code)

    def set_cookie(response: Response, token: str) -> None:
        response.set_cookie(
            COOKIE,
            token,
            max_age=SESSION_DAYS * 24 * 3600,
            path=PREFIX,
            httponly=True,
            secure=secure_cookies,
            samesite="lax",
        )

    def signed_in(request: Request) -> tuple[bool, bool]:
        """(has a valid session, the session was just re-checked and renewed)."""
        token = request.cookies.get(COOKIE)
        if not token:
            return False, False
        hashed = token_hash(token)
        if verified.get(hashed, 0.0) > clock():
            return True, False
        now = today()
        if store.session(hashed, now) is None:
            verified.pop(hashed, None)
            return False, False
        store.extend_session(hashed, now + timedelta(days=SESSION_DAYS))
        for stale in [h for h, expires in verified.items() if expires <= clock()]:
            del verified[stale]
        verified[hashed] = clock() + VERIFIED_TTL_SECONDS
        return True, True

    def serve(request: Request, key: str) -> Response:
        ok, renewed = signed_in(request)
        is_page = key in ("", "index.html", "login", "admin")
        if not ok:
            if is_page:
                return sign_in_page()
            return PlainTextResponse("Sign in at /devs/ first.", status_code=401)
        if key == "login":
            return RedirectResponse(f"{PREFIX}/", status_code=303)
        found = files.get(key or "index.html")
        if found is None:
            return PlainTextResponse("Not found.", status_code=404)
        body, content_type = found
        response = Response(body, media_type=content_type)
        if renewed:
            set_cookie(response, request.cookies[COOKIE])
        return response

    def check_password(request: Request, email: str, password: str) -> str:
        """'ok', 'bad' or 'locked'. Counts failures per email and per client address."""
        keys = [failure_key("email", email), failure_key("ip", client_address(request))]
        if any(store.failures(key) >= MAX_FAILURES for key in keys):
            return "locked"
        researcher = store.get(email)
        if researcher is None or researcher.disabled:
            burn_verification(password)
            ok = False
        else:
            ok = verify_password(researcher.password_hash, password)
        if not ok:
            for key in keys:
                store.record_failure(key)
            return "bad"
        if needs_rehash(researcher.password_hash):
            store.set_password(email, hash_password(password))
        store.clear_failures(keys[0])
        return "ok"

    def login(request: Request, form: dict[str, list[str]]) -> Response:
        email = normalize_email(form.get("email", [""])[0])
        outcome = check_password(request, email, form.get("password", [""])[0])
        if outcome == "locked":
            return sign_in_page("Too many failed attempts. Try again in 15 minutes.", 429)
        if outcome == "bad":
            return sign_in_page("That email and password don't match.")
        store.touch(email)
        token = secrets.token_urlsafe(32)
        now = today()
        store.create_session(token_hash(token), email, now + timedelta(days=SESSION_DAYS), now)
        response = RedirectResponse(f"{PREFIX}/", status_code=303)
        set_cookie(response, token)
        return response

    def me(request: Request) -> Response:
        """Who is signed in. The portal uses it to decide whether to show the Admin link."""
        token = request.cookies.get(COOKIE)
        session = store.session(token_hash(token), today()) if token else None
        if session is None:
            return PlainTextResponse("Sign in at /devs/ first.", status_code=401)
        return JSONResponse({"email": session.email, "admin": session.is_admin})

    def admin(request: Request, key: str, form: dict[str, list[str]]) -> Response:
        """Every admin request re-reads the session from the store: no cached trust here."""
        token = request.cookies.get(COOKIE)
        now = today()
        session = store.session(token_hash(token), now) if token else None
        if session is None:
            if request.method != "POST" and key == "admin":
                return sign_in_page()
            return PlainTextResponse("Sign in at /devs/ first.", status_code=401)
        if not session.is_admin:
            # Same answer as a page that doesn't exist, so the address reveals nothing.
            return PlainTextResponse("Not found.", status_code=404)

        csrf = csrf_token(token)
        fresh = session.confirmed_at is not None and now - session.confirmed_at < timedelta(
            hours=ADMIN_CONFIRM_HOURS
        )

        def page(result: accounts.Result | None = None, status_code: int = 200) -> Response:
            html = render_admin(store.all(), session.email, csrf, store.recent_audit(15), result)
            return HTMLResponse(html, status_code)

        if request.method != "POST":
            if key != "admin":
                return PlainTextResponse("Not found.", status_code=404)
            return page() if fresh else HTMLResponse(render_confirm(csrf))

        # Posts must come from our own page: a real Origin header and the session's token.
        if request.headers.get("origin") is None or not hmac.compare_digest(
            form.get("csrf", [""])[0], csrf
        ):
            return PlainTextResponse("Request refused. Reload the admin page.", status_code=403)

        action = key.removeprefix("admin/")
        if action == "confirm":
            outcome = check_password(request, session.email, form.get("password", [""])[0])
            if outcome == "locked":
                message = "Too many failed attempts. Try again in 15 minutes."
                return HTMLResponse(render_confirm(csrf, message), 429)
            if outcome == "bad":
                return HTMLResponse(render_confirm(csrf, "That password isn't right."), 401)
            store.confirm_session(token_hash(token), now)
            return RedirectResponse(f"{PREFIX}/admin", status_code=303)
        if not fresh:
            return HTMLResponse(render_confirm(csrf, "Confirm your password first."), 401)
        if action not in accounts.ACTIONS:
            return PlainTextResponse("Not found.", status_code=404)

        result = accounts.apply(
            store,
            session.email,
            action,
            form.get("email", [""])[0],
            now,
            form.get("name", [""])[0],
        )
        return page(result, 200 if result.ok else 400)

    def logout(request: Request) -> Response:
        token = request.cookies.get(COOKIE)
        if token:
            verified.pop(token_hash(token), None)
            store.delete_session(token_hash(token))
        response = RedirectResponse(f"{PREFIX}/", status_code=303)
        response.delete_cookie(COOKIE, path=PREFIX)
        return response

    def same_origin(request: Request) -> bool:
        # Browsers send Origin on every form post; a post from another site is refused.
        origin = request.headers.get("origin")
        if origin is None:
            return True
        host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
        return urlsplit(origin).netloc == host

    @app.middleware("http")
    async def portal_headers(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith((PREFIX, "/api/portal")):
            response.headers.update(PORTAL_HEADERS)
        return response

    async def handle(request: Request, path: str = "") -> Response:
        key = path.strip("/")
        is_admin_path = key == "admin" or key.startswith("admin/")
        if request.method != "POST":
            if is_admin_path:
                return await run_in_threadpool(admin, request, key, {})
            if key == "me":
                return await run_in_threadpool(me, request)
            return await run_in_threadpool(serve, request, key)
        if not same_origin(request):
            return PlainTextResponse("Cross-site request refused.", status_code=403)
        if key == "logout":
            return await run_in_threadpool(logout, request)
        if key != "login" and not is_admin_path:
            return PlainTextResponse("Method not allowed.", status_code=405)
        body = await request.body()
        if len(body) > MAX_FORM_BYTES:
            return PlainTextResponse("Request too large.", status_code=413)
        form = parse_qs(body.decode("utf-8", "replace"), keep_blank_values=True)
        if is_admin_path:
            return await run_in_threadpool(admin, request, key, form)
        return await run_in_threadpool(login, request, form)

    @app.api_route(PREFIX, methods=["GET", "HEAD"])
    def add_trailing_slash() -> Response:
        # The portal's assets are relative, so its page must live at /devs/.
        return RedirectResponse(f"{PREFIX}/", status_code=308)

    # /devs/<file> is the public address. /api/portal?path=<file> is where the Vercel rewrite
    # lands if the platform hands the function the rewritten URL instead of the original one.
    methods = ["GET", "HEAD", "POST"]
    app.add_api_route(PREFIX + "/{path:path}", handle, methods=methods)
    app.add_api_route("/api/portal", handle, methods=methods)
    return app
