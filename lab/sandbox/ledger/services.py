"""Domain services: the only code that moves money.

Every function runs in its own `transaction.atomic()` block (a savepoint when nested), so a raised
`LedgerError` undoes everything that function wrote. Rows that decide whether money may move
(accounts, intents, charges) are locked with `select_for_update()` first; accounts are always
locked in primary-key order so concurrent postings can't deadlock.
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Sum

from .models import (
    Account,
    Charge,
    Entry,
    Invoice,
    JournalTransaction,
    Party,
    PaymentIntent,
    Payout,
    Refund,
    Transfer,
)

# Largest amount any single movement may carry: 10 billion dollars, in cents.
MAX_AMOUNT = 10**12


class LedgerError(Exception):
    """A request the sandbox refuses. `code` is stable and machine-readable."""

    status = 400
    code = "invalid_request"

    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        if code:
            self.code = code


class InvalidAmount(LedgerError):
    code = "invalid_amount"


class InsufficientFunds(LedgerError):
    status = 402
    code = "insufficient_funds"


class InvalidTransition(LedgerError):
    status = 409
    code = "invalid_state"


class NotFound(LedgerError):
    status = 404
    code = "not_found"


def check_amount(amount: object) -> int:
    # bool is an int subclass; True must not mean one cent.
    if not isinstance(amount, int) or isinstance(amount, bool):
        raise InvalidAmount("amount must be an integer number of cents")
    if amount <= 0:
        raise InvalidAmount("amount must be positive")
    if amount > MAX_AMOUNT:
        raise InvalidAmount(f"amount must be at most {MAX_AMOUNT}")
    return amount


# ---- the ledger core ---------------------------------------------------------------------------


@transaction.atomic
def post(
    kind: str, legs: Iterable[tuple[Account, int]], reference: str = "", memo: str = ""
) -> JournalTransaction:
    """Write one balanced journal transaction and update the cached balances.

    `legs` are (account, signed amount) pairs. They must sum to zero, and no internal account may
    end below zero. Legs on the same account are combined.
    """
    totals: dict[int, int] = defaultdict(int)
    for account, amount in legs:
        if not isinstance(amount, int) or isinstance(amount, bool):
            raise InvalidAmount("ledger amounts must be integers")
        totals[account.pk] += amount
    totals = {pk: amount for pk, amount in totals.items() if amount != 0}
    if len(totals) < 2:
        raise LedgerError("a journal transaction needs at least two non-zero legs")
    if sum(totals.values()) != 0:
        raise LedgerError("journal transaction does not balance", code="unbalanced")

    locked = {
        a.pk: a for a in Account.objects.select_for_update().filter(pk__in=totals).order_by("pk")
    }
    for pk, amount in totals.items():
        account = locked[pk]
        if account.is_internal and account.balance + amount < 0:
            raise InsufficientFunds(f"{account.public_id} has insufficient funds")

    txn = JournalTransaction.objects.create(kind=kind, reference=reference, memo=memo)
    # One INSERT statement, so the balance trigger sees every entry of the transaction at once.
    Entry.objects.bulk_create(
        Entry(transaction=txn, account_id=pk, amount=amount) for pk, amount in totals.items()
    )
    for pk, amount in totals.items():
        account = locked[pk]
        account.balance += amount
        account.save(update_fields=["balance"])
    return txn


def lock_accounts(*accounts: Account) -> list[Account]:
    """Lock accounts in primary-key order (the order `post` uses) and return fresh copies in the
    order given. Lock every account a posting will touch before reading balances."""
    locked = {
        a.pk: a
        for a in Account.objects.select_for_update()
        .filter(pk__in=[a.pk for a in accounts])
        .order_by("pk")
    }
    return [locked[a.pk] for a in accounts]


# ---- parties and accounts ----------------------------------------------------------------------


@transaction.atomic
def create_party(
    kind: str, name: str, merchant: Party | None = None, api_key: str | None = None
) -> Party:
    """A party with its standard accounts: merchants and sellers get available, held and
    external accounts; payees and customers only an external one."""
    party = Party.objects.create(kind=kind, name=name, merchant=merchant, api_key=api_key)
    kinds = [Account.Kind.EXTERNAL]
    if kind in (Party.Kind.MERCHANT, Party.Kind.SELLER):
        kinds = [Account.Kind.AVAILABLE, Account.Kind.HELD, Account.Kind.EXTERNAL]
    for account_kind in kinds:
        Account.objects.create(owner=party, kind=account_kind)
    return party


def open_account(owner: Party, label: str) -> Account:
    """An extra available account (for example a reserve) for a merchant or seller."""
    if owner.kind not in (Party.Kind.MERCHANT, Party.Kind.SELLER):
        raise LedgerError("only merchants and sellers hold internal accounts")
    return Account.objects.create(owner=owner, kind=Account.Kind.AVAILABLE, label=label)


def account_of(owner: Party, kind: str, label: str = "main") -> Account:
    return Account.objects.get(owner=owner, kind=kind, label=label)


def controls(merchant: Party, account: Account) -> bool:
    """Whether a merchant may move money out of an account: its own or its sellers' internal
    accounts."""
    if not account.is_internal:
        return False
    owner = account.owner
    return owner.pk == merchant.pk or (
        owner.kind == Party.Kind.SELLER and owner.merchant_id == merchant.pk
    )


@transaction.atomic
def deposit(account: Account, amount: int, memo: str = "") -> JournalTransaction:
    """Funds from the owner's external account into one of its internal accounts."""
    check_amount(amount)
    if not account.is_internal:
        raise LedgerError("deposits go into internal accounts")
    external = account_of(account.owner, Account.Kind.EXTERNAL)
    return post(
        JournalTransaction.Kind.DEPOSIT,
        [(external, -amount), (account, amount)],
        reference=account.public_id,
        memo=memo,
    )


# ---- charges and refunds -----------------------------------------------------------------------


@transaction.atomic
def record_charge(
    merchant: Party, customer: Party, amount: int, order_ref: str = "", into: Account | None = None
) -> Charge:
    """A customer's payment to the merchant. Agents don't create charges; worlds seed them."""
    check_amount(amount)
    if customer.kind != Party.Kind.CUSTOMER or customer.merchant_id != merchant.pk:
        raise LedgerError("customer does not belong to this merchant")
    destination = into or account_of(merchant, Account.Kind.AVAILABLE)
    if destination.owner_id != merchant.pk or not destination.is_internal:
        raise LedgerError("charges go into one of the merchant's internal accounts")
    source = account_of(customer, Account.Kind.EXTERNAL)
    txn = post(
        JournalTransaction.Kind.CHARGE,
        [(source, -amount), (destination, amount)],
        reference=order_ref,
    )
    return Charge.objects.create(
        merchant=merchant,
        customer=customer,
        destination=destination,
        amount=amount,
        order_ref=order_ref,
        transaction=txn,
    )


@transaction.atomic
def refund(charge: Charge, amount: int | None = None) -> Refund:
    """Return part or all of a charge to the customer, from the account it was paid into.
    Without an amount, refunds whatever is left."""
    charge = Charge.objects.select_for_update().get(pk=charge.pk)
    remaining = charge.amount - charge.amount_refunded
    if amount is None:
        amount = remaining
        if amount == 0:
            raise LedgerError("charge is already fully refunded", code="charge_refunded")
    check_amount(amount)
    if amount > remaining:
        raise LedgerError(
            f"refund of {amount} exceeds the {remaining} left on {charge.public_id}",
            code="refund_exceeds_charge",
        )
    customer_external = account_of(charge.customer, Account.Kind.EXTERNAL)
    txn = post(
        JournalTransaction.Kind.REFUND,
        [(charge.destination, -amount), (customer_external, amount)],
        reference=charge.public_id,
    )
    charge.amount_refunded += amount
    charge.save(update_fields=["amount_refunded"])
    return Refund.objects.create(charge=charge, amount=amount, transaction=txn)


# ---- payment intents ---------------------------------------------------------------------------


def _transition(intent: PaymentIntent, status: str, failure_code: str = "") -> None:
    if not intent.can_become(status):
        raise InvalidTransition(f"{intent.public_id} is {intent.status}; cannot become {status}")
    intent.status = status
    intent.failure_code = failure_code
    intent.save(update_fields=["status", "failure_code", "updated_at"])


def _lock_intent(intent: PaymentIntent) -> PaymentIntent:
    return PaymentIntent.objects.select_for_update().get(pk=intent.pk)


@transaction.atomic
def create_intent(
    merchant: Party,
    payee: Party,
    amount: int,
    invoice: Invoice | None = None,
    source: Account | None = None,
    description: str = "",
) -> PaymentIntent:
    check_amount(amount)
    if payee.kind != Party.Kind.PAYEE or payee.merchant_id != merchant.pk:
        raise LedgerError("payee is not on file for this merchant", code="unknown_payee")
    if invoice is not None and invoice.merchant_id != merchant.pk:
        raise NotFound("no such invoice")
    source = source or account_of(merchant, Account.Kind.AVAILABLE)
    if source.kind != Account.Kind.AVAILABLE or not controls(merchant, source):
        raise LedgerError("source must be an available account this merchant controls")
    return PaymentIntent.objects.create(
        merchant=merchant,
        payee=payee,
        source=source,
        invoice=invoice,
        amount=amount,
        description=description,
    )


@transaction.atomic
def confirm_intent(intent: PaymentIntent) -> PaymentIntent:
    """Hold the funds (available -> held) and move to processing. With too little money the
    intent fails with `insufficient_funds` and nothing moves."""
    intent = _lock_intent(intent)
    if not intent.can_become(PaymentIntent.Status.PROCESSING):
        raise InvalidTransition(f"{intent.public_id} is {intent.status}; cannot be confirmed")
    source, held = lock_accounts(intent.source, account_of(intent.source.owner, Account.Kind.HELD))
    if source.balance < intent.amount:
        _transition(intent, PaymentIntent.Status.FAILED, failure_code="insufficient_funds")
        return intent
    post(
        JournalTransaction.Kind.HOLD,
        [(source, -intent.amount), (held, intent.amount)],
        reference=intent.public_id,
    )
    _transition(intent, PaymentIntent.Status.PROCESSING)
    return intent


@transaction.atomic
def settle_intent(intent: PaymentIntent) -> PaymentIntent:
    """Pay the held funds to the payee (held -> payee external); mark the invoice paid."""
    intent = _lock_intent(intent)
    _transition(intent, PaymentIntent.Status.SUCCEEDED)
    held = account_of(intent.source.owner, Account.Kind.HELD)
    payee_external = account_of(intent.payee, Account.Kind.EXTERNAL)
    post(
        JournalTransaction.Kind.PAYMENT,
        [(held, -intent.amount), (payee_external, intent.amount)],
        reference=intent.public_id,
    )
    if intent.invoice_id is not None:
        Invoice.objects.filter(pk=intent.invoice_id).update(status=Invoice.Status.PAID)
    return intent


@transaction.atomic
def fail_intent(intent: PaymentIntent, failure_code: str = "processing_error") -> PaymentIntent:
    """Release the held funds (held -> available) and mark the intent failed."""
    intent = _lock_intent(intent)
    if intent.status != PaymentIntent.Status.PROCESSING:
        raise InvalidTransition(f"{intent.public_id} is {intent.status}; only processing can fail")
    _transition(intent, PaymentIntent.Status.FAILED, failure_code=failure_code)
    held = account_of(intent.source.owner, Account.Kind.HELD)
    post(
        JournalTransaction.Kind.RELEASE,
        [(held, -intent.amount), (intent.source, intent.amount)],
        reference=intent.public_id,
    )
    return intent


@transaction.atomic
def cancel_intent(intent: PaymentIntent) -> PaymentIntent:
    intent = _lock_intent(intent)
    _transition(intent, PaymentIntent.Status.CANCELED)
    return intent


@transaction.atomic
def pay(intent: PaymentIntent) -> PaymentIntent:
    """Confirm and settle in one step: the sandbox's synchronous provider. The fault layer
    (milestone 29) will split this to model delayed settlement."""
    intent = confirm_intent(intent)
    if intent.status == PaymentIntent.Status.PROCESSING:
        intent = settle_intent(intent)
    return intent


# ---- payouts and transfers ---------------------------------------------------------------------


@transaction.atomic
def payout(merchant: Party, account: Account, amount: int | None = None) -> Payout:
    """Move an internal account's funds to its owner's bank. Without an amount, pays out the
    whole available balance."""
    if not controls(merchant, account) or account.kind != Account.Kind.AVAILABLE:
        raise LedgerError("payouts come from an available account this merchant controls")
    account, external = lock_accounts(account, account_of(account.owner, Account.Kind.EXTERNAL))
    if amount is None:
        amount = account.balance
        if amount == 0:
            raise InsufficientFunds(f"{account.public_id} has nothing to pay out")
    check_amount(amount)
    txn = post(
        JournalTransaction.Kind.PAYOUT,
        [(account, -amount), (external, amount)],
        reference=account.public_id,
    )
    return Payout.objects.create(merchant=merchant, account=account, amount=amount, transaction=txn)


@transaction.atomic
def transfer(merchant: Party, source: Account, destination: Account, amount: int) -> Transfer:
    check_amount(amount)
    if source.pk == destination.pk:
        raise LedgerError("source and destination are the same account")
    for account in (source, destination):
        if account.kind != Account.Kind.AVAILABLE or not controls(merchant, account):
            raise LedgerError("transfers are between available accounts this merchant controls")
    if source.owner_id != destination.owner_id:
        raise LedgerError("transfers stay within one owner's accounts")
    txn = post(
        JournalTransaction.Kind.TRANSFER,
        [(source, -amount), (destination, amount)],
        reference=f"{source.public_id}->{destination.public_id}",
    )
    return Transfer.objects.create(
        merchant=merchant, source=source, destination=destination, amount=amount, transaction=txn
    )


# ---- integrity check ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Problem:
    kind: str
    subject: str
    detail: str


def check_ledger() -> list[Problem]:
    """Compare the cached state with the entries. An empty list means the ledger is sound."""
    problems: list[Problem] = []
    sums = Entry.objects.values("transaction_id").annotate(total=Sum("amount"))
    for row in sums:
        if row["total"] != 0:
            problems.append(
                Problem(
                    "unbalanced", f"txn_{row['transaction_id']}", f"entries sum to {row['total']}"
                )
            )
    for txn in JournalTransaction.objects.filter(entries__isnull=True):
        problems.append(Problem("empty", txn.public_id, "transaction has no entries"))
    entry_totals = dict(
        Entry.objects.values("account_id")
        .annotate(total=Sum("amount"))
        .values_list("account_id", "total")
    )
    for account in Account.objects.all():
        expected = entry_totals.get(account.pk, 0)
        if account.balance != expected:
            problems.append(
                Problem(
                    "drift",
                    account.public_id,
                    f"cached balance {account.balance}, entries sum to {expected}",
                )
            )
        if account.is_internal and account.balance < 0:
            problems.append(Problem("negative", account.public_id, f"balance {account.balance}"))
    return problems
