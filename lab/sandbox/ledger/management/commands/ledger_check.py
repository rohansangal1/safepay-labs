from django.core.management.base import BaseCommand, CommandError

from ledger.services import check_ledger


class Command(BaseCommand):
    help = "Check that every transaction balances and cached balances match the entries."

    def handle(self, *args, **options):
        problems = check_ledger()
        for p in problems:
            self.stderr.write(f"{p.kind}: {p.subject}: {p.detail}")
        if problems:
            raise CommandError(f"{len(problems)} ledger problem(s)")
        self.stdout.write("ledger ok")
