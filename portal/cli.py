"""Manage researcher accounts from the terminal. There is no sign-up or sign-in page.

    npm run researcher -- init
    npm run researcher -- add ada@example.org --name "Ada Lovelace"
    npm run researcher -- list | passwd <email> | disable <email> | enable <email> | remove <email>

Needs DATABASE_URL (run `vercel env pull .env.local` once; the npm script loads that file).
"""

import argparse
import sys

from .passwords import generate_password, hash_password
from .store import PostgresStore, ResearcherStore, normalize_email


def _show_password(email: str, password: str) -> None:
    print(f"  username: {email}")
    print(f"  password: {password}")
    print("Shown once and not stored. Send it over a private channel.")
    print("Next steps: docs/PORTAL_ACCESS.md")


def run(argv: list[str], store: ResearcherStore) -> int:
    parser = argparse.ArgumentParser(prog="researcher", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init", help="create the tables (safe to run again)")
    commands.add_parser("list", help="show every researcher")
    add = commands.add_parser("add", help="create a researcher and print a generated password")
    add.add_argument("email")
    add.add_argument("--name", default="")
    for name, text in [
        ("passwd", "replace a researcher's password with a new generated one"),
        ("disable", "block a researcher without deleting them"),
        ("enable", "unblock a researcher"),
        ("remove", "delete a researcher"),
    ]:
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
            state = "disabled" if r.disabled else "active"
            print(f"{r.email:<36} {state:<9} last seen {seen}  {r.name}")
        print(f"{len(researchers)} researcher(s).")
        return 0

    email = normalize_email(args.email)
    if "@" not in email or ":" in email:
        print("That does not look like an email address (and it cannot contain ':').")
        return 2

    if args.command == "add":
        password = generate_password()
        if not store.add(email, args.name, hash_password(password)):
            print(f"{email} already exists. Use `passwd` to issue a new password.")
            return 1
        print("Researcher created.")
        _show_password(email, password)
        return 0
    if args.command == "passwd":
        password = generate_password()
        if not store.set_password(email, hash_password(password)):
            print(f"No researcher named {email}.")
            return 1
        print("Password replaced. The old one stops working within a minute.")
        _show_password(email, password)
        return 0

    done = {
        "disable": lambda: store.set_disabled(email, True),
        "enable": lambda: store.set_disabled(email, False),
        "remove": lambda: store.remove(email),
    }[args.command]()
    if not done:
        print(f"No researcher named {email}.")
        return 1
    print(f"{email}: {args.command} done. Takes effect within a minute.")
    return 0


if __name__ == "__main__":
    sys.exit(run(sys.argv[1:], PostgresStore()))
