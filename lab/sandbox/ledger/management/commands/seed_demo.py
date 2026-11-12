"""A tiny fixed demo world so a fresh stack has something to inspect.

Real worlds come from the seeded generator (lab/synth, milestone 30). Every name is synthetic.
"""

import datetime

from django.core.management.base import BaseCommand
from django.db import transaction

from ledger import services
from ledger.models import Account, Invoice, Party

DEMO_KEY = "sk_sandbox_demo"


class Command(BaseCommand):
    help = "Seed a small synthetic demo world (only into an empty database)."

    @transaction.atomic
    def handle(self, *args, **options):
        if Party.objects.exists():
            self.stdout.write("database not empty; demo world not seeded")
            return
        m = services.create_party(Party.Kind.MERCHANT, "Example Goods Co", api_key=DEMO_KEY)
        services.open_account(m, "reserve")
        services.deposit(services.account_of(m, Account.Kind.AVAILABLE), 250_000, memo="opening")
        supplier = services.create_party(Party.Kind.PAYEE, "Acme Supplies (synthetic)", merchant=m)
        printer = services.create_party(Party.Kind.PAYEE, "Lumen Print (synthetic)", merchant=m)
        due = datetime.date(2026, 12, 1)
        Invoice.objects.create(
            merchant=m, payee=supplier, number="INV-1001", amount=42_000, due_date=due
        )
        Invoice.objects.create(
            merchant=m, payee=printer, number="INV-1002", amount=9_950, due_date=due
        )
        for i, amount in enumerate((4_500, 12_000, 2_999), start=1):
            customer = services.create_party(Party.Kind.CUSTOMER, f"Customer {i:03d}", merchant=m)
            services.record_charge(m, customer, amount, order_ref=f"ORD-{i:04d}")
        seller = services.create_party(Party.Kind.SELLER, "Seller One (synthetic)", merchant=m)
        services.deposit(services.account_of(seller, Account.Kind.AVAILABLE), 18_000, memo="sales")
        self.stdout.write(f"demo world seeded; merchant API key {DEMO_KEY}")
