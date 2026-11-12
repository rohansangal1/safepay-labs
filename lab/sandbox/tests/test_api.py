"""The JSON API: auth, merchant scoping, error shape and idempotency."""

import pytest
from django.test import override_settings

from ledger import services
from ledger.models import Account, IdempotencyKey, JournalTransaction, Party, PaymentIntent

from .conftest import Api, balance


def pay_body(world, **extra):
    return {"payee": world.payee.public_id, "amount": 1_000, **extra}


def create_and_confirm(api, world, key=None, **extra):
    created = api.post("payment_intents", pay_body(world, **extra), key=key and f"{key}-create")
    assert created.status_code == 201, created.json()
    intent_id = created.json()["id"]
    return api.post(f"payment_intents/{intent_id}/confirm", key=key and f"{key}-confirm")


def test_healthz(client, db):
    assert client.get("/healthz").json() == {"ok": True}


def test_requests_need_a_merchant_key(world):
    response = Api(key="sk_wrong").get("accounts")
    assert response.status_code == 401
    assert response.json()["error"]["type"] == "authentication_error"


def test_accounts_lists_own_and_sellers_internal_accounts(api, world):
    data = api.get("accounts").json()["data"]
    owners = {row["owner"] for row in data}
    assert owners == {world.merchant.public_id, world.seller.public_id}
    assert all(row["kind"] != "external" for row in data)


def test_pay_an_invoice_end_to_end(api, world):
    response = create_and_confirm(api, world, invoice=world.invoice.public_id, amount=30_000)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "succeeded"
    assert api.get(f"invoices/{world.invoice.public_id}").json()["status"] == "paid"
    by_invoice = api.get("payment_intents", invoice=world.invoice.public_id).json()["data"]
    assert [row["id"] for row in by_invoice] == [body["id"]]


def test_insufficient_funds_is_a_402_and_the_intent_stays_failed(api, world):
    response = create_and_confirm(api, world, amount=10**9)
    assert response.status_code == 402
    error = response.json()["error"]
    assert (error["type"], error["code"]) == ("payment_error", "insufficient_funds")
    intent = api.get(f"payment_intents/{error['payment_intent']['id']}").json()
    assert intent["status"] == "failed"


@pytest.mark.parametrize(
    "body,code",
    [
        ({"amount": 100}, "not_found"),  # no payee
        ({"payee": "pty_999999", "amount": 100}, "not_found"),
        ({"payee": None, "amount": "100"}, "not_found"),
    ],
)
def test_bad_payment_requests(api, world, body, code):
    response = api.post("payment_intents", body)
    assert response.json()["error"]["code"] == code


def test_amount_must_be_integer_cents(api, world):
    response = api.post("payment_intents", pay_body(world, amount=10.5))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_amount"


def test_malformed_json(api):
    response = api.client.post(
        "/v1/payment_intents",
        "{not json",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer sk_sandbox_test",
    )
    assert response.status_code == 400


def test_method_not_allowed(api):
    assert api.post("accounts").status_code == 405


def test_merchants_cannot_see_or_touch_each_others_objects(api, world):
    other = services.create_party(Party.Kind.MERCHANT, "Other", api_key="sk_other")
    services.deposit(services.account_of(other, Account.Kind.AVAILABLE), 1_000)
    stranger = Api(key="sk_other")
    intent_id = api.post("payment_intents", pay_body(world)).json()["id"]
    assert stranger.get(f"payment_intents/{intent_id}").status_code == 404
    assert stranger.post(f"payment_intents/{intent_id}/confirm").status_code == 404
    assert stranger.post("refunds", {"charge": world.charge.public_id}).status_code == 404
    assert stranger.post("payment_intents", pay_body(world)).status_code == 404  # payee not theirs
    assert stranger.get("charges").json()["data"] == []


def test_refund_payout_transfer(api, world):
    refund = api.post("refunds", {"charge": world.charge.public_id, "amount": 500})
    assert refund.status_code == 201
    assert api.get("charges/" + world.charge.public_id).json()["amount_refunded"] == 500
    seller_account = services.account_of(world.seller, Account.Kind.AVAILABLE)
    payout = api.post("payouts", {"account": seller_account.public_id})
    assert payout.json()["amount"] == 5_000
    transfer = api.post(
        "transfers",
        {
            "source_account": world.available.public_id,
            "destination_account": world.reserve.public_id,
            "amount": 700,
        },
    )
    assert transfer.status_code == 201
    assert balance(world.reserve) == 700
    assert len(api.get("refunds").json()["data"]) == 1
    assert services.check_ledger() == []


def test_over_refund_is_refused(api, world):
    response = api.post("refunds", {"charge": world.charge.public_id, "amount": 8_001})
    assert response.json()["error"]["code"] == "refund_exceeds_charge"


def test_confirming_twice_is_a_conflict(api, world):
    first = create_and_confirm(api, world)
    second = api.post(f"payment_intents/{first.json()['id']}/confirm")
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "invalid_state"


# ---- idempotency -------------------------------------------------------------------------------


def test_same_key_same_request_replays_without_a_second_effect(api, world):
    first = api.post("refunds", {"charge": world.charge.public_id, "amount": 100}, key="k1")
    again = api.post("refunds", {"charge": world.charge.public_id, "amount": 100}, key="k1")
    assert again.status_code == first.status_code == 201
    assert again.json() == first.json()
    assert again.headers["Idempotent-Replayed"] == "true"
    assert "Idempotent-Replayed" not in first.headers
    world.charge.refresh_from_db()
    assert world.charge.amount_refunded == 100


def test_same_key_different_request_is_refused(api, world):
    api.post("refunds", {"charge": world.charge.public_id, "amount": 100}, key="k1")
    response = api.post("refunds", {"charge": world.charge.public_id, "amount": 200}, key="k1")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "idempotency_key_reused"


def test_errors_are_stored_and_replayed_too(api, world):
    first = create_and_confirm(api, world, key="big", amount=10**9)
    assert first.status_code == 402
    intent_id = first.json()["error"]["payment_intent"]["id"]
    again = api.post(f"payment_intents/{intent_id}/confirm", key="big-confirm")
    assert again.status_code == 402
    assert again.headers["Idempotent-Replayed"] == "true"


def test_keys_are_per_merchant(api, world):
    other = services.create_party(Party.Kind.MERCHANT, "Other", api_key="sk_other")
    services.deposit(services.account_of(other, Account.Kind.AVAILABLE), 1_000)
    assert api.get("accounts").status_code == 200
    api.post("payment_intents", pay_body(world), key="shared")
    response = Api(key="sk_other").post("payment_intents", pay_body(world), key="shared")
    assert response.status_code == 404  # not a replay of the first merchant's response
    assert IdempotencyKey.objects.filter(key="shared").count() == 2


def test_without_a_key_retries_repeat_the_effect(api, world):
    for _ in range(2):
        api.post("refunds", {"charge": world.charge.public_id, "amount": 100})
    world.charge.refresh_from_db()
    assert world.charge.amount_refunded == 200


@override_settings(IDEMPOTENCY_MODE="required")
def test_required_mode_refuses_posts_without_a_key(api, world):
    response = api.post("payment_intents", pay_body(world))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "idempotency_key_required"
    assert not PaymentIntent.objects.exists()
    assert api.get("accounts").status_code == 200  # reads need no key


@override_settings(IDEMPOTENCY_MODE="off")
def test_off_mode_ignores_keys(api, world):
    for _ in range(2):
        api.post("refunds", {"charge": world.charge.public_id, "amount": 100}, key="k1")
    world.charge.refresh_from_db()
    assert world.charge.amount_refunded == 200
    assert not IdempotencyKey.objects.exists()


def test_a_key_longer_than_255_is_refused(api, world):
    response = api.post("payment_intents", pay_body(world), key="x" * 256)
    assert response.json()["error"]["code"] == "idempotency_key_invalid"


def test_failed_request_does_not_leave_a_half_written_effect(api, world):
    before = JournalTransaction.objects.count()
    response = api.post("refunds", {"charge": world.charge.public_id, "amount": 9_999}, key="k9")
    assert response.status_code == 400
    assert JournalTransaction.objects.count() == before
    # The refusal itself is stored, so the same retry gets the same answer.
    assert IdempotencyKey.objects.get(key="k9").response_status == 400
