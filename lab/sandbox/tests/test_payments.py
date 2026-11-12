"""Payment intents, refunds, payouts and transfers through the services."""

import pytest

from ledger import services
from ledger.models import Account, Invoice, JournalTransaction, Party, PaymentIntent
from ledger.services import InsufficientFunds, InvalidTransition, LedgerError

from .conftest import balance

S = PaymentIntent.Status


def payee_external(world):
    return services.account_of(world.payee, Account.Kind.EXTERNAL)


def test_intent_lifecycle_holds_then_pays(world):
    start = balance(world.available)
    intent = services.create_intent(world.merchant, world.payee, 30_000, invoice=world.invoice)
    assert intent.status == S.REQUIRES_CONFIRMATION
    assert balance(world.available) == start  # creating moves nothing

    intent = services.confirm_intent(intent)
    assert intent.status == S.PROCESSING
    assert balance(world.available) == start - 30_000
    assert balance(world.held) == 30_000

    intent = services.settle_intent(intent)
    assert intent.status == S.SUCCEEDED
    assert balance(world.held) == 0
    assert balance(payee_external(world)) == 30_000
    world.invoice.refresh_from_db()
    assert world.invoice.status == Invoice.Status.PAID
    kinds = JournalTransaction.objects.filter(reference=intent.public_id).values_list(
        "kind", flat=True
    )
    assert sorted(kinds) == ["hold", "payment"]
    assert services.check_ledger() == []


def test_failed_processing_releases_the_hold(world):
    start = balance(world.available)
    intent = services.confirm_intent(services.create_intent(world.merchant, world.payee, 1_000))
    intent = services.fail_intent(intent)
    assert intent.status == S.FAILED
    assert balance(world.available) == start
    assert balance(world.held) == 0


def test_insufficient_funds_fails_without_moving_money(world):
    start = balance(world.available)
    intent = services.pay(services.create_intent(world.merchant, world.payee, start + 1))
    assert (intent.status, intent.failure_code) == (S.FAILED, "insufficient_funds")
    assert balance(world.available) == start
    assert not JournalTransaction.objects.filter(reference=intent.public_id).exists()


@pytest.mark.parametrize(
    "steps,then",
    [
        (["pay"], "confirm_intent"),  # succeeded is final
        (["pay"], "cancel_intent"),
        (["cancel_intent"], "confirm_intent"),
        ([], "settle_intent"),  # can't settle before confirming
        ([], "fail_intent"),
    ],
)
def test_invalid_transitions_are_refused(world, steps, then):
    intent = services.create_intent(world.merchant, world.payee, 100)
    for step in steps:
        intent = getattr(services, step)(intent)
    before = list(JournalTransaction.objects.values_list("pk", flat=True))
    with pytest.raises(InvalidTransition):
        getattr(services, then)(intent)
    assert list(JournalTransaction.objects.values_list("pk", flat=True)) == before


def test_paying_twice_is_two_payments(world):
    # The sandbox does not dedupe by invoice; that is what the oracle calls a duplicate payment.
    for _ in range(2):
        services.pay(
            services.create_intent(world.merchant, world.payee, 100, invoice=world.invoice)
        )
    assert balance(payee_external(world)) == 200


def test_payee_must_be_on_file_for_the_merchant(world):
    other = services.create_party(Party.Kind.MERCHANT, "Other", api_key="sk_other")
    stranger = services.create_party(Party.Kind.PAYEE, "Stranger", merchant=other)
    with pytest.raises(LedgerError) as exc:
        services.create_intent(world.merchant, stranger, 100)
    assert exc.value.code == "unknown_payee"


def test_pay_from_a_seller_account_holds_in_the_sellers_held_account(world):
    seller_available = services.account_of(world.seller, Account.Kind.AVAILABLE)
    intent = services.confirm_intent(
        services.create_intent(world.merchant, world.payee, 1_000, source=seller_available)
    )
    assert balance(services.account_of(world.seller, Account.Kind.HELD)) == 1_000
    services.settle_intent(intent)
    assert balance(seller_available) == 4_000


def test_partial_then_full_refund(world):
    start = balance(world.available)
    services.refund(world.charge, 3_000)
    rest = services.refund(world.charge)
    assert rest.amount == 5_000
    world.charge.refresh_from_db()
    assert world.charge.amount_refunded == 8_000
    assert balance(world.available) == start - 8_000
    assert balance(services.account_of(world.customer, Account.Kind.EXTERNAL)) == 0


def test_refund_cannot_exceed_the_charge(world):
    services.refund(world.charge, 5_000)
    with pytest.raises(LedgerError) as exc:
        services.refund(world.charge, 3_001)
    assert exc.value.code == "refund_exceeds_charge"
    services.refund(world.charge)
    with pytest.raises(LedgerError) as exc:
        services.refund(world.charge)
    assert exc.value.code == "charge_refunded"


def test_refund_needs_funds_in_the_account_it_came_from(world):
    services.transfer(world.merchant, world.available, world.reserve, balance(world.available))
    with pytest.raises(InsufficientFunds):
        services.refund(world.charge, 100)
    world.charge.refresh_from_db()
    assert world.charge.amount_refunded == 0


def test_payout_whole_balance_to_the_owners_bank(world):
    seller_available = services.account_of(world.seller, Account.Kind.AVAILABLE)
    created = services.payout(world.merchant, seller_available)
    assert created.amount == 5_000
    assert balance(seller_available) == 0
    assert balance(services.account_of(world.seller, Account.Kind.EXTERNAL)) == 0
    with pytest.raises(InsufficientFunds):
        services.payout(world.merchant, seller_available)


def test_payout_refuses_accounts_the_merchant_does_not_control(world):
    other = services.create_party(Party.Kind.MERCHANT, "Other", api_key="sk_other")
    with pytest.raises(LedgerError):
        services.payout(world.merchant, services.account_of(other, Account.Kind.AVAILABLE), 1)
    with pytest.raises(LedgerError):
        services.payout(world.merchant, world.held, 1)


def test_transfer_between_own_accounts_only(world):
    services.transfer(world.merchant, world.available, world.reserve, 2_500)
    assert balance(world.reserve) == 2_500
    seller_available = services.account_of(world.seller, Account.Kind.AVAILABLE)
    with pytest.raises(LedgerError):
        services.transfer(world.merchant, world.available, seller_available, 1)
    with pytest.raises(LedgerError):
        services.transfer(world.merchant, world.reserve, world.reserve, 1)
    with pytest.raises(InsufficientFunds):
        services.transfer(world.merchant, world.reserve, world.available, 2_501)
