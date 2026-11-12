"""Concurrency against a real Postgres, with real commits: double submits and a hot account.

These use `transactional_db`, so every request commits on its own connection, row locks and the
unique index on idempotency keys are exercised for real, and the deferred balance trigger runs at
each commit.
"""

import threading

import pytest
from django.db import connection

from ledger import services
from ledger.models import Account, PaymentIntent

from .conftest import Api, build_world

THREADS = 8


def run_together(fn, n=THREADS):
    """Start n threads that call fn(i) at the same moment; return their results in order."""
    barrier = threading.Barrier(n)
    results = [None] * n
    errors = []

    def worker(i):
        try:
            barrier.wait()
            results[i] = fn(i)
        except Exception as exc:  # surfaced below; a thread can't fail the test directly
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors, errors
    return results


@pytest.fixture
def committed_world(transactional_db):
    return build_world()


def test_concurrent_retries_with_one_key_pay_once(committed_world):
    w = committed_world
    intent_id = (
        Api().post("payment_intents", {"payee": w.payee.public_id, "amount": 2_500}).json()["id"]
    )
    responses = run_together(
        lambda i: Api().post(f"payment_intents/{intent_id}/confirm", key="double-submit")
    )
    assert {r.status_code for r in responses} == {200}
    assert sum(1 for r in responses if "Idempotent-Replayed" not in r.headers) == 1
    payee_external = services.account_of(w.payee, Account.Kind.EXTERNAL)
    assert payee_external.balance == 2_500
    assert services.check_ledger() == []


def test_concurrent_creates_with_one_key_create_one_intent(committed_world):
    w = committed_world
    body = {"payee": w.payee.public_id, "amount": 1_000}
    responses = run_together(lambda i: Api().post("payment_intents", body, key="create-once"))
    assert len({r.json()["id"] for r in responses}) == 1
    assert PaymentIntent.objects.count() == 1


def test_concurrent_confirms_without_a_key_succeed_once(committed_world):
    w = committed_world
    intent_id = (
        Api().post("payment_intents", {"payee": w.payee.public_id, "amount": 2_500}).json()["id"]
    )
    responses = run_together(lambda i: Api().post(f"payment_intents/{intent_id}/confirm"))
    codes = sorted(r.status_code for r in responses)
    assert codes == [200] + [409] * (THREADS - 1)
    assert services.account_of(w.payee, Account.Kind.EXTERNAL).balance == 2_500


def test_hot_account_never_overdraws(committed_world):
    w = committed_world
    funds = services.account_of(w.merchant, Account.Kind.AVAILABLE).balance  # 108_000
    amount = 25_000  # funds for 4 of the 8 payments
    api = Api()
    ids = [
        api.post("payment_intents", {"payee": w.payee.public_id, "amount": amount}).json()["id"]
        for _ in range(THREADS)
    ]
    responses = run_together(lambda i: Api().post(f"payment_intents/{ids[i]}/confirm"))
    succeeded = sum(1 for r in responses if r.status_code == 200)
    assert succeeded == funds // amount
    assert all(r.status_code in (200, 402) for r in responses)
    available = services.account_of(w.merchant, Account.Kind.AVAILABLE)
    assert available.balance == funds - succeeded * amount
    assert services.check_ledger() == []


def test_concurrent_partial_refunds_never_exceed_the_charge(committed_world):
    w = committed_world  # the charge is 8_000
    responses = run_together(
        lambda i: Api().post("refunds", {"charge": w.charge.public_id, "amount": 3_000})
    )
    assert sum(1 for r in responses if r.status_code == 201) == 2
    w.charge.refresh_from_db()
    assert w.charge.amount_refunded == 6_000
    assert services.check_ledger() == []
