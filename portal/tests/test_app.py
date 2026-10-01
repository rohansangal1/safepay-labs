from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from portal.app import MAX_FAILURES, VERIFIED_TTL_SECONDS, create_app
from portal.passwords import hash_password
from portal.store import FAILURE_WINDOW_SECONDS, MemoryStore

EMAIL = "ada@example.org"
PASSWORD = "correct horse battery staple"
AUTH = (EMAIL, PASSWORD)


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def store(clock: Clock) -> MemoryStore:
    store = MemoryStore(clock)
    store.add(EMAIL, "Ada", hash_password(PASSWORD))
    return store


@pytest.fixture
def client(tmp_path: Path, store: MemoryStore, clock: Clock) -> TestClient:
    site = tmp_path / "site"
    (site / "data").mkdir(parents=True)
    (site / "index.html").write_text("<h1>portal</h1>")
    (site / "app.js").write_text("console.log(1)")
    (site / "data" / "assessments.json").write_text('{"secret": true}')
    (site / "notes.txt").write_text("not a servable type")
    (tmp_path / "outside.json").write_text('{"outside": true}')
    return TestClient(create_app(store, site, clock), follow_redirects=False)


def test_no_credentials_gets_a_browser_challenge(client: TestClient) -> None:
    for path in ["/portal/", "/portal/app.js", "/portal/data/assessments.json", "/api/portal"]:
        response = client.get(path)
        assert response.status_code == 401, path
        assert response.headers["www-authenticate"].startswith('Basic realm="Research portal"')
        assert "secret" not in response.text


def test_correct_credentials_serve_the_portal(client: TestClient) -> None:
    assert client.get("/portal/", auth=AUTH).text == "<h1>portal</h1>"
    data = client.get("/portal/data/assessments.json", auth=AUTH)
    assert data.json() == {"secret": True}
    assert data.headers["content-type"].startswith("application/json")
    assert client.get("/api/portal", params={"path": "app.js"}, auth=AUTH).text == "console.log(1)"
    assert client.head("/portal/app.js", auth=AUTH).status_code == 200


def test_email_is_case_insensitive(client: TestClient) -> None:
    assert client.get("/portal/", auth=("Ada@Example.org", PASSWORD)).status_code == 200


def test_wrong_password_and_unknown_user_are_refused_alike(client: TestClient) -> None:
    wrong = client.get("/portal/", auth=(EMAIL, "nope"))
    unknown = client.get("/portal/", auth=("nobody@example.org", PASSWORD))
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.text == unknown.text


def test_malformed_authorization_header_is_refused(client: TestClient) -> None:
    for header in ["Basic !!!not-base64", "Basic", "Bearer abc", "Basic bm9jb2xvbg=="]:
        assert client.get("/portal/", headers={"Authorization": header}).status_code == 401


def test_disabled_researcher_is_refused(client: TestClient, store: MemoryStore) -> None:
    store.set_disabled(EMAIL, True)
    assert client.get("/portal/", auth=AUTH).status_code == 401


def test_disabling_takes_effect_once_the_verified_cache_expires(
    client: TestClient, store: MemoryStore, clock: Clock
) -> None:
    assert client.get("/portal/", auth=AUTH).status_code == 200
    store.set_disabled(EMAIL, True)
    clock.now += VERIFIED_TTL_SECONDS + 1
    assert client.get("/portal/", auth=AUTH).status_code == 401


def test_only_files_inside_site_are_reachable(client: TestClient) -> None:
    for path in [
        "/portal/../outside.json",
        "/portal/%2e%2e/outside.json",
        "/portal/..%2foutside.json",
        "/portal/data/../../outside.json",
        "/portal/notes.txt",
        "/portal/missing.js",
    ]:
        response = client.get(path, auth=AUTH)
        assert response.status_code == 404, path
        assert "outside" not in response.text
    escaped = client.get("/api/portal", params={"path": "../outside.json"}, auth=AUTH)
    assert escaped.status_code == 404


def test_writes_are_not_allowed(client: TestClient) -> None:
    assert client.post("/portal/", auth=AUTH).status_code == 405
    assert client.delete("/portal/app.js", auth=AUTH).status_code == 405


def test_repeated_failures_lock_out_then_recover(client: TestClient, clock: Clock) -> None:
    for _ in range(MAX_FAILURES):
        assert client.get("/portal/", auth=(EMAIL, "nope")).status_code == 401
    locked = client.get("/portal/", auth=AUTH)
    assert locked.status_code == 429
    assert locked.headers["retry-after"] == str(FAILURE_WINDOW_SECONDS)
    clock.now += FAILURE_WINDOW_SECONDS + 1
    assert client.get("/portal/", auth=AUTH).status_code == 200


def test_requests_without_credentials_do_not_count_as_failures(client: TestClient) -> None:
    for _ in range(MAX_FAILURES + 5):
        client.get("/portal/")
    assert client.get("/portal/", auth=AUTH).status_code == 200


def test_every_portal_response_is_private(client: TestClient) -> None:
    responses = [
        client.get("/portal/"),
        client.get("/portal/", auth=AUTH),
        client.get("/portal/missing.js", auth=AUTH),
        client.get("/portal"),
    ]
    for response in responses:
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["x-robots-tag"] == "noindex, nofollow"
        assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_portal_without_trailing_slash_redirects(client: TestClient) -> None:
    response = client.get("/portal")
    assert response.status_code == 308
    assert response.headers["location"] == "/portal/"


def test_successful_sign_in_records_last_seen(client: TestClient, store: MemoryStore) -> None:
    assert store.get(EMAIL).last_seen_at is None
    client.get("/portal/", auth=AUTH)
    assert store.get(EMAIL).last_seen_at is not None
