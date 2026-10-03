import re

from portal.cli import run
from portal.passwords import (
    burn_verification,
    generate_password,
    hash_password,
    needs_rehash,
    verify_password,
)
from portal.store import MemoryStore


def test_hash_round_trip() -> None:
    stored = hash_password("s3cret")
    assert stored.startswith("$argon2id$")
    assert "s3cret" not in stored
    assert verify_password(stored, "s3cret")
    assert not verify_password(stored, "S3cret")
    assert not needs_rehash(stored)


def test_same_password_hashes_differently_each_time() -> None:
    assert hash_password("s3cret") != hash_password("s3cret")


def test_garbage_hash_never_verifies() -> None:
    assert not verify_password("not-a-hash", "anything")
    assert not verify_password("", "")
    burn_verification("anything")  # must not raise


def test_weak_parameters_are_flagged_for_rehash() -> None:
    from argon2 import PasswordHasher

    weak = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash("s3cret")
    assert verify_password(weak, "s3cret")
    assert needs_rehash(weak)


def test_generated_passwords_are_long_and_distinct() -> None:
    passwords = {generate_password() for _ in range(50)}
    assert len(passwords) == 50
    assert all(len(p) == 24 for p in passwords)


def test_cli_add_prints_a_password_that_works(capsys) -> None:
    store = MemoryStore()
    assert run(["add", "Ada@Example.org", "--name", "Ada"], store) == 0
    out = capsys.readouterr().out
    password = re.search(r"password: (\S+)", out).group(1)
    researcher = store.get("ada@example.org")
    assert researcher.name == "Ada"
    assert password not in researcher.password_hash
    assert verify_password(researcher.password_hash, password)


def test_cli_add_refuses_duplicates_and_bad_emails(capsys) -> None:
    store = MemoryStore()
    assert run(["add", "ada@example.org"], store) == 0
    assert run(["add", "ada@example.org"], store) == 1
    assert run(["add", "not-an-email"], store) == 2
    assert len(store.all()) == 1


def test_cli_passwd_replaces_the_password(capsys) -> None:
    store = MemoryStore()
    run(["add", "ada@example.org"], store)
    old = re.search(r"password: (\S+)", capsys.readouterr().out).group(1)
    assert run(["passwd", "ada@example.org"], store) == 0
    new = re.search(r"password: (\S+)", capsys.readouterr().out).group(1)
    stored = store.get("ada@example.org").password_hash
    assert verify_password(stored, new) and not verify_password(stored, old)


def test_cli_passwd_disable_and_signout_end_sessions(capsys) -> None:
    from datetime import UTC, datetime, timedelta

    now = datetime.now(UTC)
    for command in ["passwd", "disable", "signout", "remove"]:
        store = MemoryStore()
        run(["add", "ada@example.org"], store)
        store.create_session("hash", "ada@example.org", now + timedelta(days=1), now)
        assert store.session("hash", now).email == "ada@example.org"
        assert run([command, "ada@example.org"], store) == 0
        store.set_disabled("ada@example.org", False)
        assert store.session("hash", now) is None, command


def test_cli_disable_enable_remove_and_list(capsys) -> None:
    store = MemoryStore()
    run(["add", "ada@example.org"], store)
    assert run(["disable", "ada@example.org"], store) == 0
    assert store.get("ada@example.org").disabled
    run(["list"], store)
    assert "disabled" in capsys.readouterr().out
    assert run(["enable", "ada@example.org"], store) == 0
    assert not store.get("ada@example.org").disabled
    assert run(["remove", "ada@example.org"], store) == 0
    assert run(["remove", "ada@example.org"], store) == 1
    assert store.all() == []


def test_cli_grant_and_revoke_admin_and_audit_trail(capsys) -> None:
    store = MemoryStore()
    run(["add", "ada@example.org"], store)
    assert run(["grant", "ada@example.org"], store) == 0
    assert store.get("ada@example.org").is_admin
    run(["list"], store)
    assert "admin" in capsys.readouterr().out
    assert run(["revoke", "ada@example.org"], store) == 0
    assert not store.get("ada@example.org").is_admin
    assert run(["grant", "nobody@example.org"], store) == 1
    trail = [(e.actor, e.action, e.target) for e in store.recent_audit(10)]
    assert trail == [
        ("terminal", "revoke", "ada@example.org"),
        ("terminal", "grant", "ada@example.org"),
        ("terminal", "add", "ada@example.org"),
    ]
