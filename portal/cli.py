"""Manage researcher accounts from the terminal. The admin page at /devs/admin does the same
things with buttons; this is the way in before any admin exists, and the fallback.

    npm run researcher -- init
    npm run researcher -- add ada@example.org --name "Ada Lovelace"
    npm run researcher -- grant ada@example.org          # make her an admin
    npm run researcher -- list
    npm run researcher -- passwd | signout | disable | enable | remove | revoke <email>

Needs DATABASE_URL (run `vercel env pull .env.local` once; the npm script loads that file).
"""

import argparse
import sys
from datetime import UTC, datetime

from . import accounts
from .store import PostgresStore, ResearcherStore

HELP = {
    "passwd": "replace a researcher's password with a new generated one",
    "signout": "sign a researcher out of every browser",
    "disable": "block a researcher without deleting them",
    "enable": "unblock a researcher",
    "remove": "delete a researcher",
    "grant": "make a researcher an admin (can open /devs/admin)",
    "revoke": "take admin away from a researcher",
}


def run(argv: list[str], store: ResearcherStore) -> int:
    parser = argparse.ArgumentParser(prog="researcher", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init", help="create or upgrade the tables (safe to run again)")
    commands.add_parser("list", help="show every researcher")
    add = commands.add_parser("add", help="create a researcher and print a generated password")
    add.add_argument("email")
    add.add_argument("--name", default="")
    for name, text in HELP.items():
        commands.add_parser(name, help=text).add_argument("email")
    args = parser.parse_args(argv)

    if args.command == "init":
        store.init_schema()
        print("Schema is in place.")
        return 0
    if args.command == "list":
        researchers = store.all()
        for r in researchers:
            seen = r.last_seen_at.strftime("%Y-%m-%d %H:%M") if r.last_seen_at else "never"
            state = ("disabled" if r.disabled else "active") + (", admin" if r.is_admin else "")
            print(f"{r.email:<36} {state:<16} last seen {seen}  {r.name}")
        print(f"{len(researchers)} researcher(s).")
        return 0

    if "@" not in args.email:
        print("That does not look like an email address.")
        return 2
    result = accounts.apply(
        store,
        accounts.TERMINAL,
        args.command,
        args.email,
        datetime.now(UTC),
        getattr(args, "name", ""),
    )
    print(result.message)
    if result.password:
        print(f"  email:    {args.email.strip().lower()}")
        print(f"  password: {result.password}")
        print("Shown once and not stored. Send it over a private channel.")
        print("Sign in at /devs/ on the project site. Next steps: docs/PORTAL_ACCESS.md")
    elif result.ok:
        print("Takes effect within a minute.")
    return 0 if result.ok else 1


if __name__ == "__main__":
    sys.exit(run(sys.argv[1:], PostgresStore()))
