"""The researcher gate: checks HTTP Basic credentials, then serves the portal files from site/.

site/ is not part of the public static output, so this handler is the only way to reach it.
There is no sign-in page: a 401 with `WWW-Authenticate: Basic` makes the browser ask.
"""

import hashlib
import hmac
import secrets
import time
from collections.abc import Callable
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import PlainTextResponse, RedirectResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .passwords import burn_verification, hash_password, needs_rehash, verify_password
from .store import FAILURE_WINDOW_SECONDS, ResearcherStore, normalize_email

REALM = "Research portal"
MAX_FAILURES = 10  # per email and per client address, within FAILURE_WINDOW_SECONDS
VERIFIED_TTL_SECONDS = 60  # how long a warm instance trusts a credential it has just checked

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
    "Referrer-Policy": "no-referrer",
    # The portal renders chart bars with inline style attributes and has a data: favicon.
    "Content-Security-Policy": (
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
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


def create_app(
    store: ResearcherStore,
    site_dir: Path,
    clock: Callable[[], float] = time.monotonic,
) -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    basic = HTTPBasic(realm=REALM, auto_error=False)
    files = load_files(site_dir)
    cache_key = secrets.token_bytes(32)
    verified: dict[bytes, float] = {}

    def failure_key(kind: str, value: str) -> str:
        return hashlib.sha256(f"{kind}:{value}".encode()).hexdigest()

    def client_address(request: Request) -> str:
        # Vercel sets x-forwarded-for itself; the first entry is the client.
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        return forwarded or (request.client.host if request.client else "unknown")

    def challenge() -> Response:
        return PlainTextResponse(
            "Researcher access only.",
            status_code=401,
            headers={"WWW-Authenticate": f'Basic realm="{REALM}", charset="UTF-8"'},
        )

    def check(request: Request, credentials: HTTPBasicCredentials | None) -> Response | None:
        """None when the request may proceed, otherwise the response that refuses it."""
        if credentials is None:
            return challenge()
        email = normalize_email(credentials.username)
        keys = [failure_key("email", email), failure_key("ip", client_address(request))]
        if any(store.failures(key) >= MAX_FAILURES for key in keys):
            return PlainTextResponse(
                "Too many failed attempts. Try again later.",
                status_code=429,
                headers={"Retry-After": str(FAILURE_WINDOW_SECONDS)},
            )

        digest = hmac.new(
            cache_key, f"{email}\0{credentials.password}".encode(), hashlib.sha256
        ).digest()
        now = clock()
        if verified.get(digest, 0.0) > now:
            return None

        researcher = store.get(email)
        if researcher is None or researcher.disabled:
            burn_verification(credentials.password)
            ok = False
        else:
            ok = verify_password(researcher.password_hash, credentials.password)
        if not ok:
            for key in keys:
                store.record_failure(key)
            return challenge()

        if needs_rehash(researcher.password_hash):
            store.set_password(email, hash_password(credentials.password))
        store.clear_failures(keys[0])
        store.touch(email)
        for stale in [d for d, expires in verified.items() if expires <= now]:
            del verified[stale]
        verified[digest] = now + VERIFIED_TTL_SECONDS
        return None

    @app.middleware("http")
    async def portal_headers(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith(("/portal", "/api/portal")):
            response.headers.update(PORTAL_HEADERS)
        return response

    def serve(
        request: Request,
        path: str = "",
        credentials: HTTPBasicCredentials | None = Depends(basic),  # noqa: B008
    ) -> Response:
        refusal = check(request, credentials)
        if refusal is not None:
            return refusal
        key = path.lstrip("/")
        if key == "" or key.endswith("/"):
            key += "index.html"
        found = files.get(key)
        if found is None:
            return PlainTextResponse("Not found.", status_code=404)
        body, content_type = found
        return Response(body, media_type=content_type)

    @app.api_route("/portal", methods=["GET", "HEAD"])
    def add_trailing_slash() -> Response:
        # The portal's assets are relative, so its page must live at /portal/.
        return RedirectResponse("/portal/", status_code=308)

    # /portal/<file> is the public address. /api/portal?path=<file> is where the Vercel rewrite
    # lands if the platform hands the function the rewritten URL instead of the original one.
    app.add_api_route("/portal/{path:path}", serve, methods=["GET", "HEAD"])
    app.add_api_route("/api/portal", serve, methods=["GET", "HEAD"])
    return app
