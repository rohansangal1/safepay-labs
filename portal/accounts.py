"""Account changes, shared by the admin page and the terminal tool so both behave the same,
end sessions the same way and write the same audit log."""

from dataclasses import dataclass
from datetime import datetime

from .passwords import generate_password, hash_password
from .store import ResearcherStore, normalize_email

TERMINAL = "terminal"  # audit-log actor for changes made with `npm run researcher`
ACTIONS = ("add", "passwd", "signout", "disable", "enable", "remove", "grant", "revoke")


@dataclass(frozen=True)
class Result:
    ok: bool
    message: str
    password: str | None = None  # set when a new password was generated; show it exactly once


def apply(
    store: ResearcherStore, actor: str, action: str, email: str, now: datetime, name: str = ""
) -> Result:
    email = normalize_email(email)
    if action not in ACTIONS:
        return Result(False, "Unknown action.")
    if "@" not in email or len(email) > 254:
        return Result(False, "That does not look like an email address.")
    if email == actor and action in ("disable", "remove", "revoke"):
        # Keeps at least one working admin: you can't lock yourself out by mistake.
        return Result(False, "You can't do that to your own account. Ask another admin.")

    password = None
    if action == "add":
        password = generate_password()
        if not store.add(email, name.strip()[:100], hash_password(password)):
            return Result(False, f"{email} already exists. Use “New password” instead.")
        message = f"Created {email}."
    elif store.get(email) is None:
        return Result(False, f"No account for {email}.")
    elif action == "passwd":
        password = generate_password()
        store.set_password(email, hash_password(password))
        store.delete_sessions_for(email)
        message = f"New password for {email}. They are signed out everywhere."
    elif action == "signout":
        count = store.delete_sessions_for(email)
        message = f"Signed {email} out of {count} browser(s)."
    elif action == "disable":
        store.set_disabled(email, True)
        store.delete_sessions_for(email)
        message = f"Disabled {email} and signed them out everywhere."
    elif action == "enable":
        store.set_disabled(email, False)
        message = f"Enabled {email}."
    elif action == "remove":
        store.remove(email)
        message = f"Removed {email}."
    else:
        store.set_admin(email, action == "grant")
        message = f"{email} is {'now' if action == 'grant' else 'no longer'} an admin."

    store.record_audit(now, actor, action, email)
    return Result(True, message, password)
