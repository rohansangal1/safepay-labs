"""Property-based tests (Hypothesis).

1. The ledger always sums to zero: random sequences of every money operation keep each
   transaction balanced, cached balances equal to the entries, internal accounts non-negative,
   and every balance equal to a simple model of what should have happened.
2. One intended payment, one economic effect: retrying a request with the same Idempotency-Key
   any number of times moves the money once.
"""

import itertools
import uuid

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from hypothesis.stateful import (
    Bundle,
    RuleBasedStateMachine,
    initialize,
    invariant,
    rule,
    run_state_machine_as_test,
)

from ledger import services
from ledger.models import Account, PaymentIntent
from ledger.services import LedgerError

from .conftest import Api, build_world

amounts = st.integers(min_value=1, max_value=60_000)
_worlds = itertools.count()


class LedgerMachine(RuleBasedStateMachine):
    """Drives the services at random and keeps an independent model of every balance."""

    intents = Bundle("intents")

    @initialize()
    def make_world(self):
        n = next(_worlds)
        self.w = build_world(key=f"sk_prop_{n}", funds=50_000)
        w = self.w
        self.seller_available = services.account_of(w.seller, Account.Kind.AVAILABLE)
        self.sources = [w.available, w.reserve, self.seller_available]
        self.tracked = Account.objects.filter(owner__in=[w.merchant, w.payee, w.customer, w.seller])
        # The model: start from the balances build_world produced.
        self.model = {a.pk: a.balance for a in self.tracked}

    def move(self, legs):
        for account, amount in legs:
            self.model[account.pk] += amount

    def ext(self, party):
        return services.account_of(party, Account.Kind.EXTERNAL)

    def held_for(self, account):
        return services.account_of(account.owner, Account.Kind.HELD)

    @rule(src=st.integers(0, 2), dst=st.integers(0, 2), amount=amounts)
    def transfer(self, src, dst, amount):
        source, destination = self.sources[src], self.sources[dst]
        try:
            services.transfer(self.w.merchant, source, destination, amount)
        except LedgerError:
            return
        self.move([(source, -amount), (destination, amount)])

    @rule(target=intents, src=st.integers(0, 2), amount=amounts)
    def create_intent(self, src, amount):
        return services.create_intent(
            self.w.merchant, self.w.payee, amount, source=self.sources[src]
        )

    @rule(intent=intents)
    def confirm(self, intent):
        try:
            result = services.confirm_intent(intent)
        except LedgerError:
            return
        if result.status == PaymentIntent.Status.PROCESSING:
            self.move(
                [(intent.source, -intent.amount), (self.held_for(intent.source), intent.amount)]
            )

    @rule(intent=intents)
    def settle(self, intent):
        try:
            services.settle_intent(intent)
        except LedgerError:
            return
        self.move(
            [
                (self.held_for(intent.source), -intent.amount),
                (self.ext(self.w.payee), intent.amount),
            ]
        )

    @rule(intent=intents)
    def fail(self, intent):
        try:
            services.fail_intent(intent)
        except LedgerError:
            return
        self.move([(self.held_for(intent.source), -intent.amount), (intent.source, intent.amount)])

    @rule(intent=intents)
    def cancel(self, intent):
        try:
            services.cancel_intent(intent)
        except LedgerError:
            pass

    @rule(amount=st.one_of(st.none(), amounts))
    def refund(self, amount):
        try:
            created = services.refund(self.w.charge, amount)
        except LedgerError:
            return
        self.move(
            [(self.w.available, -created.amount), (self.ext(self.w.customer), created.amount)]
        )

    @rule(amount=amounts)
    def new_charge(self, amount):
        services.record_charge(self.w.merchant, self.w.customer, amount)
        self.move([(self.ext(self.w.customer), -amount), (self.w.available, amount)])

    @rule(src=st.integers(0, 2), amount=st.one_of(st.none(), amounts))
    def payout(self, src, amount):
        account = self.sources[src]
        try:
            created = services.payout(self.w.merchant, account, amount)
        except LedgerError:
            return
        self.move([(account, -created.amount), (self.ext(account.owner), created.amount)])

    @invariant()
    def ledger_is_sound(self):
        assert services.check_ledger() == []

    @invariant()
    def balances_match_the_model(self):
        actual = {a.pk: a.balance for a in self.tracked.all()}
        assert actual == self.model
        assert sum(actual.values()) == 0


@pytest.mark.django_db
def test_ledger_always_balances(immediate):
    run_state_machine_as_test(
        LedgerMachine,
        settings=settings(max_examples=40, stateful_step_count=30, deadline=None),
    )


@pytest.mark.django_db
@settings(
    max_examples=40,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    amount=st.integers(min_value=1, max_value=20_000),
    create_retries=st.integers(min_value=1, max_value=4),
    confirm_retries=st.integers(min_value=1, max_value=4),
)
def test_one_intended_payment_one_economic_effect(world, amount, create_retries, confirm_retries):
    # `world` is shared by every example of this test, so fund each payment first.
    services.deposit(world.available, amount)
    api = Api()
    key = uuid.uuid4().hex
    payee_external = services.account_of(world.payee, Account.Kind.EXTERNAL)
    before = Account.objects.get(pk=payee_external.pk).balance

    body = {"payee": world.payee.public_id, "amount": amount}
    created = [api.post("payment_intents", body, key=f"{key}-c") for _ in range(create_retries)]
    assert len({r.json()["id"] for r in created}) == 1
    intent_id = created[0].json()["id"]
    confirmed = [
        api.post(f"payment_intents/{intent_id}/confirm", key=f"{key}-p")
        for _ in range(confirm_retries)
    ]
    assert {r.status_code for r in confirmed} == {200}

    assert Account.objects.get(pk=payee_external.pk).balance == before + amount
    assert services.check_ledger() == []
