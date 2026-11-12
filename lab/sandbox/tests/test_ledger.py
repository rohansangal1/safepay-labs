"""The ledger core: balanced postings, cached balances, immutability and the drift check."""

import pytest
from django.db import IntegrityError, InternalError, connection, transaction

from ledger import services
from ledger.models import Account, Entry, JournalTransaction
from ledger.services import InsufficientFunds, InvalidAmount, LedgerError

from .conftest import balance


def test_post_moves_money_and_updates_cached_balances(world):
    services.post("transfer", [(world.available, -1_000), (world.reserve, 1_000)])
    assert balance(world.available) == 100_000 + 8_000 - 1_000
    assert balance(world.reserve) == 1_000
    assert services.check_ledger() == []


@pytest.mark.parametrize(
    "legs",
    [
        [(0, -100), (1, 99)],  # unbalanced
        [(0, -100)],  # one leg
        [(0, 100), (0, -100)],  # nets to nothing
    ],
)
def test_post_rejects_bad_legs(world, legs):
    accounts = [world.available, world.reserve]
    with pytest.raises(LedgerError):
        services.post("transfer", [(accounts[i], amount) for i, amount in legs])
    assert JournalTransaction.objects.filter(kind="transfer").count() == 0


@pytest.mark.parametrize("amount", [1.5, "100", True, None])
def test_post_rejects_non_integer_amounts(world, amount):
    with pytest.raises(InvalidAmount):
        services.post("transfer", [(world.available, amount), (world.reserve, 1)])


@pytest.mark.parametrize("amount", [0, -5, 10**12 + 1, 2.0, False])
def test_check_amount_rejects(amount):
    with pytest.raises(InvalidAmount):
        services.check_amount(amount)


def test_internal_account_cannot_go_negative(world):
    with pytest.raises(InsufficientFunds):
        services.post("transfer", [(world.reserve, -1), (world.available, 1)])
    assert balance(world.reserve) == 0


def test_external_account_may_go_negative(world):
    external = services.account_of(world.customer, Account.Kind.EXTERNAL)
    assert balance(external) == -8_000


def test_database_refuses_negative_internal_balance(world):
    with pytest.raises(IntegrityError), transaction.atomic():
        Account.objects.filter(pk=world.reserve.pk).update(balance=-1)


def test_entries_are_immutable(world):
    entry = Entry.objects.first()
    with pytest.raises(IntegrityError), transaction.atomic():
        Entry.objects.filter(pk=entry.pk).update(amount=entry.amount + 1)
    with pytest.raises(IntegrityError), transaction.atomic():
        Entry.objects.filter(pk=entry.pk).delete()
    with pytest.raises(IntegrityError), transaction.atomic():
        JournalTransaction.objects.filter(pk=entry.transaction_id).update(memo="edited")


def test_database_refuses_an_unbalanced_transaction(world):
    txn = JournalTransaction.objects.create(kind="transfer")
    with pytest.raises((IntegrityError, InternalError)), transaction.atomic():
        Entry.objects.create(transaction=txn, account=world.available, amount=-5)


def test_balance_trigger_is_deferred_to_commit_by_default(world):
    # Inserting entries one by one works when the check runs at commit.
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
    txn = JournalTransaction.objects.create(kind="transfer")
    Entry.objects.create(transaction=txn, account=world.reserve, amount=5)
    Entry.objects.create(transaction=txn, account=world.available, amount=-5)
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")  # fires the pending checks now: balanced


def test_check_ledger_reports_drift(world):
    Account.objects.filter(pk=world.reserve.pk).update(balance=77)
    problems = services.check_ledger()
    assert [(p.kind, p.subject) for p in problems] == [("drift", world.reserve.public_id)]


def test_check_ledger_reports_an_empty_transaction(world):
    txn = JournalTransaction.objects.create(kind="transfer")
    assert ("empty", txn.public_id) in [(p.kind, p.subject) for p in services.check_ledger()]


def test_all_balances_sum_to_zero(world):
    assert sum(Account.objects.values_list("balance", flat=True)) == 0
