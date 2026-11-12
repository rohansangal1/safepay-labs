import json
import os
from dataclasses import dataclass

import pytest
from django.db import connection
from django.test import Client
from hypothesis import settings

from ledger import services
from ledger.models import Account, Charge, Invoice, Party

MERCHANT_KEY = "sk_sandbox_test"

# In containers and CI there is nowhere to keep Hypothesis's example database.
settings.register_profile("ephemeral", database=None)
settings.load_profile(os.environ.get("HYPOTHESIS_PROFILE", "default"))


@pytest.fixture
def immediate(db):
    """Run inside the test transaction with the balance trigger firing per statement, not at a
    commit that never comes (pytest-django rolls each test back)."""
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")


@dataclass
class World:
    merchant: Party
    payee: Party
    customer: Party
    seller: Party
    available: Account
    held: Account
    reserve: Account
    invoice: Invoice
    charge: Charge


def build_world(key: str = MERCHANT_KEY, funds: int = 100_000) -> World:
    m = services.create_party(Party.Kind.MERCHANT, "Test Merchant", api_key=key)
    available = services.account_of(m, Account.Kind.AVAILABLE)
    reserve = services.open_account(m, "reserve")
    services.deposit(available, funds)
    payee = services.create_party(Party.Kind.PAYEE, "Test Payee", merchant=m)
    customer = services.create_party(Party.Kind.CUSTOMER, "Test Customer", merchant=m)
    seller = services.create_party(Party.Kind.SELLER, "Test Seller", merchant=m)
    services.deposit(services.account_of(seller, Account.Kind.AVAILABLE), 5_000)
    invoice = Invoice.objects.create(merchant=m, payee=payee, number="INV-1", amount=30_000)
    charge = services.record_charge(m, customer, 8_000, order_ref="ORD-1")
    return World(
        merchant=m,
        payee=payee,
        customer=customer,
        seller=seller,
        available=available,
        held=services.account_of(m, Account.Kind.HELD),
        reserve=reserve,
        invoice=invoice,
        charge=charge,
    )


@pytest.fixture
def world(immediate) -> World:
    return build_world()


def balance(account: Account) -> int:
    account.refresh_from_db()
    return account.balance


class Api:
    """A Django test client that speaks the sandbox's JSON API as one merchant."""

    def __init__(self, key: str = MERCHANT_KEY):
        self.client = Client()
        self.key = key

    def _headers(self, idempotency_key: str | None) -> dict:
        headers = {"HTTP_AUTHORIZATION": f"Bearer {self.key}"}
        if idempotency_key:
            headers["HTTP_IDEMPOTENCY_KEY"] = idempotency_key
        return headers

    def get(self, path: str, **params):
        return self.client.get(f"/v1/{path}", params, **self._headers(None))

    def post(self, path: str, body: dict | None = None, key: str | None = None):
        return self.client.post(
            f"/v1/{path}",
            json.dumps(body or {}),
            content_type="application/json",
            **self._headers(key),
        )


@pytest.fixture
def api(world) -> Api:
    return Api()
