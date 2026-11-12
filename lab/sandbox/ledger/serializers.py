"""Plain-dict views of sandbox objects for the JSON API. Ids are public ids (`pi_12`)."""

from .models import Account, Charge, Invoice, Party, PaymentIntent, Payout, Refund, Transfer


def _ts(value) -> str:
    return value.isoformat()


def account(a: Account) -> dict:
    return {
        "id": a.public_id,
        "owner": a.owner.public_id,
        "owner_name": a.owner.name,
        "kind": a.kind,
        "label": a.label,
        "balance": a.balance,
    }


def party(p: Party) -> dict:
    return {"id": p.public_id, "kind": p.kind, "name": p.name}


def invoice(i: Invoice) -> dict:
    return {
        "id": i.public_id,
        "number": i.number,
        "payee": i.payee.public_id,
        "payee_name": i.payee.name,
        "amount": i.amount,
        "status": i.status,
        "due_date": i.due_date.isoformat() if i.due_date else None,
    }


def payment_intent(pi: PaymentIntent) -> dict:
    return {
        "id": pi.public_id,
        "object": "payment_intent",
        "payee": pi.payee.public_id,
        "source_account": pi.source.public_id,
        "invoice": pi.invoice.public_id if pi.invoice_id else None,
        "amount": pi.amount,
        "description": pi.description,
        "status": pi.status,
        "failure_code": pi.failure_code or None,
        "created_at": _ts(pi.created_at),
    }


def charge(c: Charge) -> dict:
    return {
        "id": c.public_id,
        "customer": c.customer.public_id,
        "customer_name": c.customer.name,
        "amount": c.amount,
        "amount_refunded": c.amount_refunded,
        "order_ref": c.order_ref,
        "created_at": _ts(c.created_at),
    }


def refund(r: Refund) -> dict:
    return {
        "id": r.public_id,
        "object": "refund",
        "charge": r.charge.public_id,
        "amount": r.amount,
        "created_at": _ts(r.created_at),
    }


def payout(p: Payout) -> dict:
    return {
        "id": p.public_id,
        "object": "payout",
        "account": p.account.public_id,
        "amount": p.amount,
        "created_at": _ts(p.created_at),
    }


def transfer(t: Transfer) -> dict:
    return {
        "id": t.public_id,
        "object": "transfer",
        "source_account": t.source.public_id,
        "destination_account": t.destination.public_id,
        "amount": t.amount,
        "created_at": _ts(t.created_at),
    }
