"""The sandbox's JSON API (`/v1/`). Every query is limited to the calling merchant's objects."""

from django.db.models import Q
from django.http import JsonResponse

from . import serializers, services
from .api import BadRequest, endpoint, error, get_owned
from .models import Account, Charge, Invoice, Party, PaymentIntent, Payout, Refund, Transfer


def healthz(request):
    return JsonResponse({"ok": True})


def _controlled_accounts(merchant: Party):
    return (
        Account.objects.select_related("owner")
        .filter(Q(owner=merchant) | Q(owner__kind=Party.Kind.SELLER, owner__merchant=merchant))
        .exclude(kind=Account.Kind.EXTERNAL)
    )


def _listing(items, serialize) -> JsonResponse:
    return JsonResponse({"data": [serialize(item) for item in items]})


def _optional_str(body: dict, field: str, limit: int = 200) -> str:
    value = body.get(field, "")
    if not isinstance(value, str) or len(value) > limit:
        raise BadRequest(f"{field} must be a string of at most {limit} characters")
    return value


@endpoint("GET")
def accounts(request, merchant, body):
    return _listing(_controlled_accounts(merchant).order_by("pk"), serializers.account)


@endpoint("GET")
def payees(request, merchant, body):
    rows = Party.objects.filter(kind=Party.Kind.PAYEE, merchant=merchant).order_by("pk")
    return _listing(rows, serializers.party)


def _invoices(merchant):
    return Invoice.objects.select_related("payee").filter(merchant=merchant)


@endpoint("GET")
def invoices(request, merchant, body):
    rows = _invoices(merchant).order_by("pk")
    if status := request.GET.get("status"):
        rows = rows.filter(status=status)
    if number := request.GET.get("number"):
        rows = rows.filter(number=number)
    return _listing(rows, serializers.invoice)


@endpoint("GET")
def invoice_detail(request, merchant, body, invoice_id):
    return JsonResponse(serializers.invoice(get_owned(_invoices(merchant), invoice_id, "inv")))


def _intents(merchant):
    return PaymentIntent.objects.select_related("payee", "source", "invoice").filter(
        merchant=merchant
    )


@endpoint("GET", "POST")
def payment_intents(request, merchant, body):
    if request.method == "GET":
        rows = _intents(merchant).order_by("pk")
        if invoice := request.GET.get("invoice"):
            rows = rows.filter(invoice=get_owned(_invoices(merchant), invoice, "inv"))
        if status := request.GET.get("status"):
            rows = rows.filter(status=status)
        return _listing(rows, serializers.payment_intent)

    payee = get_owned(
        Party.objects.filter(kind=Party.Kind.PAYEE, merchant=merchant), body.get("payee"), "pty"
    )
    invoice = None
    if body.get("invoice") is not None:
        invoice = get_owned(_invoices(merchant), body["invoice"], "inv")
    source = None
    if body.get("source_account") is not None:
        source = get_owned(_controlled_accounts(merchant), body["source_account"], "acct")
    intent = services.create_intent(
        merchant,
        payee,
        body.get("amount"),
        invoice=invoice,
        source=source,
        description=_optional_str(body, "description"),
    )
    return JsonResponse(serializers.payment_intent(intent), status=201)


@endpoint("GET")
def payment_intent_detail(request, merchant, body, intent_id):
    return JsonResponse(serializers.payment_intent(get_owned(_intents(merchant), intent_id, "pi")))


@endpoint("POST")
def payment_intent_confirm(request, merchant, body, intent_id):
    intent = services.pay(get_owned(_intents(merchant), intent_id, "pi"))
    intent = _intents(merchant).get(pk=intent.pk)
    if intent.status == PaymentIntent.Status.FAILED:
        # The failure is committed (the intent stays failed); only the response is an error.
        return error(
            402,
            intent.failure_code or "payment_failed",
            f"{intent.public_id} failed: {intent.failure_code}",
            payment_intent=serializers.payment_intent(intent),
        )
    return JsonResponse(serializers.payment_intent(intent))


@endpoint("POST")
def payment_intent_cancel(request, merchant, body, intent_id):
    intent = services.cancel_intent(get_owned(_intents(merchant), intent_id, "pi"))
    return JsonResponse(serializers.payment_intent(_intents(merchant).get(pk=intent.pk)))


def _charges(merchant):
    return Charge.objects.select_related("customer").filter(merchant=merchant)


@endpoint("GET")
def charges(request, merchant, body):
    rows = _charges(merchant).order_by("pk")
    if order_ref := request.GET.get("order_ref"):
        rows = rows.filter(order_ref=order_ref)
    return _listing(rows, serializers.charge)


@endpoint("GET")
def charge_detail(request, merchant, body, charge_id):
    return JsonResponse(serializers.charge(get_owned(_charges(merchant), charge_id, "ch")))


@endpoint("GET", "POST")
def refunds(request, merchant, body):
    if request.method == "GET":
        rows = Refund.objects.select_related("charge").filter(charge__merchant=merchant)
        return _listing(rows.order_by("pk"), serializers.refund)
    charge = get_owned(_charges(merchant), body.get("charge"), "ch")
    created = services.refund(charge, body.get("amount"))
    return JsonResponse(serializers.refund(created), status=201)


@endpoint("GET", "POST")
def payouts(request, merchant, body):
    if request.method == "GET":
        rows = Payout.objects.select_related("account").filter(merchant=merchant)
        return _listing(rows.order_by("pk"), serializers.payout)
    account = get_owned(_controlled_accounts(merchant), body.get("account"), "acct")
    created = services.payout(merchant, account, body.get("amount"))
    return JsonResponse(serializers.payout(created), status=201)


@endpoint("GET", "POST")
def transfers(request, merchant, body):
    if request.method == "GET":
        rows = Transfer.objects.select_related("source", "destination").filter(merchant=merchant)
        return _listing(rows.order_by("pk"), serializers.transfer)
    accounts_ = _controlled_accounts(merchant)
    source = get_owned(accounts_, body.get("source_account"), "acct")
    destination = get_owned(accounts_, body.get("destination_account"), "acct")
    created = services.transfer(merchant, source, destination, body.get("amount"))
    return JsonResponse(serializers.transfer(created), status=201)
