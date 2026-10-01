from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from portal.app import COOKIE, MAX_FAILURES, SESSION_DAYS, VERIFIED_TTL_SECONDS, create_app
from portal.passwords import hash_password
from portal.store import FAILURE_WINDOW_SECONDS, MemoryStore

EMAIL = "ada@example.org"
PASSWORD = "correct horse battery staple"
LOGIN = {"email": EMAIL, "password": PASSWORD}


class Clock:
    """One clock for both the monotonic timer and the calendar, advanced by hand."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def today(self) -> datetime:
        return datetime(2026, 10, 1, tzinfo=UTC) + timedelta(seconds=self.now)


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def store(clock: Clock) -> MemoryStore:
    store = MemoryStore(clock)
    store.add(EMAIL, "Ada", hash_password(PASSWORD))
    return store


@pytest.fixture
def site(tmp_path: Path) -> Path:
    site = tmp_path / "site"
    (site / "data").mkdir(parents=True)
    (site / "index.html").write_text("<h1>portal</h1>")
    (site / "app.js").write_text("console.log(1)")
    (site / "data" / "assessments.json").write_text('{"secret": true}')
    (site / "notes.txt").write_text("not a servable type")
    (tmp_path / "outside.json").write_text('{"outside": true}')
    return site


@pytest.fixture
def client(site: Path, store: MemoryStore, clock: Clock) -> TestClient:
    app = create_app(store, site, clock, clock.today, secure_cookies=False)
    return TestClient(app, follow_redirects=False)


@pytest.fixture
def signed_in(client: TestClient) -> TestClient:
    assert client.post("/devs/login", data=LOGIN).status_code == 303
    return client


def test_signed_out_visitor_sees_the_sign_in_form(client: TestClient) -> None:
    for path in ["/devs/", "/devs/index.html", "/devs/login", "/api/portal"]:
        response = client.get(path)
        assert response.status_code == 401, path
        assert "Dev sign in" in response.text
        assert 'type="password"' in response.text
        assert "portal</h1>" not in response.text
        assert "www-authenticate" not in response.headers  # no browser pop-up


def test_signed_out_visitor_gets_no_portal_files(client: TestClient) -> None:
    for path in ["/devs/app.js", "/devs/data/assessments.json", "/devs/missing.js"]:
        response = client.get(path)
        assert response.status_code == 401, path
        assert "secret" not in response.text and "console" not in response.text
    by_query = client.get("/api/portal", params={"path": "data/assessments.json"})
    assert by_query.status_code == 401


def test_signing_in_once_opens_the_portal(client: TestClient) -> None:
    response = client.post("/devs/login", data=LOGIN)
    assert response.status_code == 303
    assert response.headers["location"] == "/devs/"
    assert client.get("/devs/").text == "<h1>portal</h1>"
    data = client.get("/devs/data/assessments.json")
    assert data.json() == {"secret": True}
    assert data.headers["content-type"].startswith("application/json")
    # The cookie is scoped to /devs, which is the only address a browser ever sees.
    cookie = {"Cookie": f"{COOKIE}={client.cookies.get(COOKIE)}"}
    rewritten = client.get("/api/portal", params={"path": "app.js"}, headers=cookie)
    assert rewritten.text == "console.log(1)"
    assert client.head("/devs/app.js").status_code == 200
    assert client.get("/devs/login").headers["location"] == "/devs/"


def test_sign_in_through_the_rewritten_address_works(client: TestClient) -> None:
    assert client.post("/api/portal", params={"path": "login"}, data=LOGIN).status_code == 303
    assert client.get("/devs/").status_code == 200


def test_session_cookie_is_locked_down(site: Path, store: MemoryStore, clock: Clock) -> None:
    app = create_app(store, site, clock, clock.today)  # production default: Secure
    response = TestClient(app, follow_redirects=False).post("/devs/login", data=LOGIN)
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{COOKIE}=")
    for flag in ["HttpOnly", "Secure", "SameSite=lax", "Path=/devs"]:
        assert flag in cookie, flag
    assert f"Max-Age={SESSION_DAYS * 24 * 3600}" in cookie
    token = cookie.split("=", 1)[1].split(";")[0]
    assert token not in str(store._sessions)  # only its hash is stored


def test_email_is_case_insensitive(client: TestClient) -> None:
    form = {"email": " Ada@Example.org ", "password": PASSWORD}
    assert client.post("/devs/login", data=form).status_code == 303


def test_wrong_password_and_unknown_email_are_refused_alike(client: TestClient) -> None:
    wrong = client.post("/devs/login", data={"email": EMAIL, "password": "nope"})
    unknown = client.post("/devs/login", data={"email": "nobody@example.org", "password": "x"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.text == unknown.text
    assert "don't match" in wrong.text
    assert "set-cookie" not in wrong.headers
    assert client.get("/devs/app.js").status_code == 401


def test_empty_and_oversized_forms_are_refused(client: TestClient) -> None:
    assert client.post("/devs/login", data={}).status_code == 401
    assert client.post("/devs/login", content=b"x" * 5000).status_code == 413


def test_forged_cookie_is_refused(client: TestClient) -> None:
    client.cookies.set(COOKIE, "made-up-token")
    assert client.get("/devs/app.js").status_code == 401


def test_sign_out_ends_the_session(signed_in: TestClient) -> None:
    token = signed_in.cookies.get(COOKIE)
    assert signed_in.post("/devs/logout").status_code == 303
    assert signed_in.get("/devs/app.js").status_code == 401
    signed_in.cookies.set(COOKIE, token)  # a copied cookie is dead too
    assert signed_in.get("/devs/app.js").status_code == 401


def test_posts_from_another_site_are_refused(client: TestClient) -> None:
    evil = {"Origin": "https://evil.example"}
    assert client.post("/devs/login", data=LOGIN, headers=evil).status_code == 403
    assert client.post("/devs/logout", headers=evil).status_code == 403
    same = {"Origin": "http://testserver"}
    assert client.post("/devs/login", data=LOGIN, headers=same).status_code == 303


def test_disabled_researcher_cannot_sign_in(client: TestClient, store: MemoryStore) -> None:
    store.set_disabled(EMAIL, True)
    assert client.post("/devs/login", data=LOGIN).status_code == 401


def test_disabling_ends_an_open_session_once_the_cache_expires(
    signed_in: TestClient, store: MemoryStore, clock: Clock
) -> None:
    assert signed_in.get("/devs/app.js").status_code == 200
    store.set_disabled(EMAIL, True)
    clock.now += VERIFIED_TTL_SECONDS + 1
    assert signed_in.get("/devs/app.js").status_code == 401


def test_session_stays_alive_with_use_and_expires_without(
    signed_in: TestClient, clock: Clock
) -> None:
    day = 24 * 3600
    for _ in range(4):  # 240 days of visiting every 60 days: never asked again
        clock.now += 60 * day
        response = signed_in.get("/devs/")
        assert response.status_code == 200
        assert COOKIE in response.headers.get("set-cookie", "")  # browser copy renewed too
    clock.now += (SESSION_DAYS + 1) * day
    assert signed_in.get("/devs/").status_code == 401


def test_only_files_inside_site_are_reachable(signed_in: TestClient) -> None:
    for path in [
        "/devs/../outside.json",
        "/devs/%2e%2e/outside.json",
        "/devs/..%2foutside.json",
        "/devs/data/../../outside.json",
        "/devs/notes.txt",
        "/devs/missing.js",
    ]:
        response = signed_in.get(path)
        assert response.status_code == 404, path
        assert "outside" not in response.text
    cookie = {"Cookie": f"{COOKIE}={signed_in.cookies.get(COOKIE)}"}
    escaped = signed_in.get("/api/portal", params={"path": "../outside.json"}, headers=cookie)
    assert escaped.status_code == 404


def test_other_writes_are_not_allowed(signed_in: TestClient) -> None:
    assert signed_in.post("/devs/app.js").status_code == 405
    assert signed_in.delete("/devs/app.js").status_code == 405


def test_repeated_failures_lock_out_then_recover(client: TestClient, clock: Clock) -> None:
    for _ in range(MAX_FAILURES):
        bad = client.post("/devs/login", data={"email": EMAIL, "password": "nope"})
        assert bad.status_code == 401
    locked = client.post("/devs/login", data=LOGIN)
    assert locked.status_code == 429
    assert "Too many failed attempts" in locked.text
    clock.now += FAILURE_WINDOW_SECONDS + 1
    assert client.post("/devs/login", data=LOGIN).status_code == 303


def test_every_portal_response_is_private(client: TestClient) -> None:
    responses = [
        client.get("/devs/"),
        client.get("/devs/app.js"),
        client.get("/devs"),
        client.post("/devs/login", data=LOGIN),
        client.get("/devs/"),
        client.get("/devs/missing.js"),
    ]
    for response in responses:
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["x-robots-tag"] == "noindex, nofollow"
        assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_devs_without_trailing_slash_redirects(client: TestClient) -> None:
    response = client.get("/devs")
    assert response.status_code == 308
    assert response.headers["location"] == "/devs/"


def test_successful_sign_in_records_last_seen(client: TestClient, store: MemoryStore) -> None:
    assert store.get(EMAIL).last_seen_at is None
    client.post("/devs/login", data=LOGIN)
    assert store.get(EMAIL).last_seen_at is not None


# ---------- Admin page ----------

ADMIN = "grace@example.org"
ADMIN_PASSWORD = "admin password"
ORIGIN = {"Origin": "http://testserver"}


@pytest.fixture
def admin(client: TestClient, store: MemoryStore) -> TestClient:
    store.add(ADMIN, "Grace", hash_password(ADMIN_PASSWORD))
    store.set_admin(ADMIN, True)
    client.post("/devs/login", data={"email": ADMIN, "password": ADMIN_PASSWORD})
    return client


def csrf_of(client: TestClient) -> str:
    from portal.admin import csrf_token

    return csrf_token(client.cookies.get(COOKIE))


def act(client: TestClient, action: str, **form: str):
    data = {"csrf": csrf_of(client), **form}
    return client.post(f"/devs/admin/{action}", data=data, headers=ORIGIN)


def test_admin_page_is_hidden_from_everyone_else(
    client: TestClient, signed_in: TestClient
) -> None:
    # signed_in is an ordinary researcher: the page looks like it doesn't exist.
    assert signed_in.get("/devs/admin").status_code == 404
    assert signed_in.get("/devs/admin").text == signed_in.get("/devs/nothing-here").text
    refused = act(signed_in, "add", email="mallory@example.org")
    assert refused.status_code == 404
    assert signed_in.get("/devs/me").json() == {"email": EMAIL, "admin": False}


def test_admin_page_needs_a_session(client: TestClient, store: MemoryStore) -> None:
    page = client.get("/devs/admin")
    assert page.status_code == 401 and "Dev sign in" in page.text
    post = client.post("/devs/admin/add", data={"email": "m@example.org"}, headers=ORIGIN)
    assert post.status_code == 401
    assert client.get("/devs/me").status_code == 401
    assert store.get("m@example.org") is None


def test_admin_sees_the_page_and_the_dev_list(admin: TestClient) -> None:
    page = admin.get("/devs/admin")
    assert page.status_code == 200
    assert "Manage devs" in page.text and EMAIL in page.text and ADMIN in page.text
    assert admin.get("/devs/me").json() == {"email": ADMIN, "admin": True}


def test_admin_adds_a_dev_and_the_password_works_once_shown(
    admin: TestClient, store: MemoryStore, site: Path, clock: Clock
) -> None:
    import re

    response = act(admin, "add", email="New.Dev@Example.org", name="New Dev")
    assert response.status_code == 200
    password = re.search(r'<code class="secret">([^<]+)</code>', response.text).group(1)
    assert store.get("new.dev@example.org").name == "New Dev"
    assert password not in admin.get("/devs/admin").text  # shown once only
    other = TestClient(
        create_app(store, site, clock, clock.today, secure_cookies=False), follow_redirects=False
    )
    form = {"email": "new.dev@example.org", "password": password}
    assert other.post("/devs/login", data=form).status_code == 303
    assert act(admin, "add", email="new.dev@example.org").status_code == 400  # duplicate


def test_admin_removes_a_dev_and_their_session_dies(
    admin: TestClient, store: MemoryStore, site: Path, clock: Clock
) -> None:
    dev = TestClient(
        create_app(store, site, clock, clock.today, secure_cookies=False), follow_redirects=False
    )
    dev.post("/devs/login", data=LOGIN)
    assert dev.get("/devs/app.js").status_code == 200
    assert act(admin, "remove", email=EMAIL).status_code == 200
    assert store.get(EMAIL) is None
    clock.now += VERIFIED_TTL_SECONDS + 1  # their server instance trusts the session this long
    assert dev.get("/devs/app.js").status_code == 401
    assert dev.post("/devs/login", data=LOGIN).status_code == 401


def test_admin_disable_enable_passwd_signout_grant_revoke(
    admin: TestClient, store: MemoryStore
) -> None:
    assert act(admin, "disable", email=EMAIL).status_code == 200
    assert store.get(EMAIL).disabled
    assert act(admin, "enable", email=EMAIL).status_code == 200
    assert not store.get(EMAIL).disabled
    old_hash = store.get(EMAIL).password_hash
    assert 'class="secret"' in act(admin, "passwd", email=EMAIL).text
    assert store.get(EMAIL).password_hash != old_hash
    assert act(admin, "signout", email=EMAIL).status_code == 200
    assert act(admin, "grant", email=EMAIL).status_code == 200
    assert store.get(EMAIL).is_admin
    assert act(admin, "revoke", email=EMAIL).status_code == 200
    assert not store.get(EMAIL).is_admin
    assert act(admin, "explode", email=EMAIL).status_code == 404
    actions = [e.action for e in store.recent_audit(20)]
    assert actions == ["revoke", "grant", "signout", "passwd", "enable", "disable"]
    assert all(e.actor == ADMIN for e in store.recent_audit(20))


def test_admin_cannot_lock_themselves_out(admin: TestClient, store: MemoryStore) -> None:
    for action in ["disable", "remove", "revoke"]:
        assert act(admin, action, email=ADMIN).status_code == 400, action
    me = store.get(ADMIN)
    assert me is not None and me.is_admin and not me.disabled


def test_admin_posts_need_the_csrf_token_and_an_origin(
    admin: TestClient, store: MemoryStore
) -> None:
    target = {"email": EMAIL}
    no_token = admin.post("/devs/admin/remove", data=target, headers=ORIGIN)
    bad_token = admin.post("/devs/admin/remove", data={**target, "csrf": "x" * 64}, headers=ORIGIN)
    no_origin = admin.post("/devs/admin/remove", data={**target, "csrf": csrf_of(admin)})
    other_site = admin.post(
        "/devs/admin/remove",
        data={**target, "csrf": csrf_of(admin)},
        headers={"Origin": "https://evil.example"},
    )
    assert [r.status_code for r in (no_token, bad_token, no_origin, other_site)] == [403] * 4
    assert store.get(EMAIL) is not None


def test_admin_page_asks_for_the_password_again_after_a_while(
    admin: TestClient, store: MemoryStore, clock: Clock
) -> None:
    from portal.admin import ADMIN_CONFIRM_HOURS

    clock.now += ADMIN_CONFIRM_HOURS * 3600 - 60  # a working day later: still open
    assert "Manage devs" in admin.get("/devs/admin").text
    clock.now += 60
    clock.now += ADMIN_CONFIRM_HOURS * 3600 + 1
    page = admin.get("/devs/admin")
    assert "Confirm it's you" in page.text and EMAIL not in page.text
    assert act(admin, "remove", email=EMAIL).status_code == 401
    assert store.get(EMAIL) is not None
    assert act(admin, "confirm", password="wrong").status_code == 401
    assert act(admin, "confirm", password=ADMIN_PASSWORD).status_code == 303
    assert "Manage devs" in admin.get("/devs/admin").text
    assert act(admin, "remove", email=EMAIL).status_code == 200


def test_wrong_confirmations_lock_like_wrong_sign_ins(admin: TestClient, clock: Clock) -> None:
    from portal.admin import ADMIN_CONFIRM_HOURS

    clock.now += ADMIN_CONFIRM_HOURS * 3600 + 1
    for _ in range(MAX_FAILURES):
        assert act(admin, "confirm", password="wrong").status_code == 401
    assert act(admin, "confirm", password=ADMIN_PASSWORD).status_code == 429


def test_demoted_admin_loses_the_page_immediately(admin: TestClient, store: MemoryStore) -> None:
    assert admin.get("/devs/admin").status_code == 200
    store.set_admin(ADMIN, False)
    assert admin.get("/devs/admin").status_code == 404
    assert act(admin, "remove", email=EMAIL).status_code == 404
    assert store.get(EMAIL) is not None


def test_names_and_emails_are_escaped_on_the_admin_page(
    admin: TestClient, store: MemoryStore
) -> None:
    store.add("x@example.org", "<script>alert(1)</script>", hash_password("pw"))
    page = admin.get("/devs/admin").text
    assert "<script>alert(1)</script>" not in page
    assert "&lt;script&gt;" in page


def test_sign_in_hint_appears_only_when_configured(
    client: TestClient, site: Path, store: MemoryStore
) -> None:
    assert 'class="local"' not in client.get("/devs/").text
    hinted = TestClient(create_app(store, site, sign_in_hint="Local server."))
    assert '<p class="local">Local server.</p>' in hinted.get("/devs/").text


def test_browsers_are_allowed_to_send_a_real_origin_on_our_forms(client: TestClient) -> None:
    # Regression: with "no-referrer" a real browser posts `Origin: null` and every sign-in is
    # refused as cross-site. curl and this test client don't do that, so pin the header itself.
    assert client.get("/devs/").headers["referrer-policy"] == "same-origin"
    null_origin = client.post("/devs/login", data=LOGIN, headers={"Origin": "null"})
    assert null_origin.status_code == 403
