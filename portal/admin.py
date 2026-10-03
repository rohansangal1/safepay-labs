"""HTML for the admin page at /devs/admin. Everything shown comes from the database, so every
value is escaped. No scripts: each button is a plain form post."""

import hashlib
import hmac
from datetime import datetime
from html import escape

from .accounts import Result
from .store import AuditEntry, Researcher

ADMIN_CONFIRM_HOURS = 12  # how long a password check keeps the admin page open: about once a day

AUDIT_LABELS = {
    "add": "created",
    "passwd": "issued a new password for",
    "signout": "signed out",
    "disable": "disabled",
    "enable": "enabled",
    "remove": "removed",
    "grant": "made admin",
    "revoke": "removed admin from",
}

# The landing page's mark, drawn still; styled by site/style.css.
_BRAND = (
    '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true">'
    '<rect width="32" height="32" rx="9" class="logo-tile"/>'
    '<g transform="rotate(-28 16 16)">'
    '<ellipse cx="16" cy="16" rx="12" ry="6.2" class="logo-ring back"/></g>'
    '<circle cx="16" cy="16" r="4.6" class="logo-core"/>'
    '<g transform="rotate(-28 16 16)"><path d="M28 16A12 6.2 0 0 1 4 16" class="logo-ring"/>'
    '<circle cx="28" cy="16" r="1.8" class="logo-dot"/></g></svg>'
    '<span class="brand-name">Safe<em>Pay</em> Labs</span>'
)

_STYLE = """
  .admin main { max-width: 980px; }
  .admin form { margin: 0; }
  .admin .signout { margin-left: auto; }
  .admin .row-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: flex-start; }
  .admin button, .admin summary {
    font: inherit; font-size: 13px; color: var(--text); background: var(--surface);
    border: 1px solid var(--border); border-radius: 999px; padding: 5px 13px; cursor: pointer;
    list-style: none; white-space: nowrap;
  }
  .admin summary::-webkit-details-marker { display: none; }
  .admin button:hover, .admin summary:hover { background: var(--surface-2); }
  .admin button.primary {
    background: var(--text); border-color: var(--text); color: var(--on-dark); padding: 8px 18px;
  }
  .admin button.primary:hover { background: var(--accent); border-color: var(--accent); }
  .admin button.danger, .admin summary.danger { color: var(--critical-ink); }
  .admin details[open] { display: grid; gap: 6px; }
  .admin details p { font-size: 13px; color: var(--text-2); max-width: 220px; }
  .admin .add { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; }
  .admin label { display: grid; gap: 4px; font-size: 13px; font-weight: 550; }
  .admin input {
    font: inherit; color: var(--text); background: var(--bg);
    border: 1px solid var(--border); border-radius: 12px; padding: 7px 12px; min-width: 220px;
  }
  .admin .tag {
    display: inline-block; font-size: 12px; font-weight: 550; border-radius: 999px;
    padding: 1px 8px; margin-left: 6px; background: var(--surface-2); color: var(--text-2);
  }
  .admin .tag.admin-tag { background: var(--accent-soft); color: var(--accent); }
  .admin .tag.off { color: var(--critical-ink); }
  .admin .notice {
    border-radius: 12px; background: var(--surface); padding: 10px 14px;
    border: 1px solid var(--border);
  }
  .admin .notice.bad { color: var(--critical-ink); }
  .admin .secret {
    display: block; margin: 8px 0; font: 16px var(--mono);
    background: var(--surface-2); padding: 8px 12px; border-radius: 8px; user-select: all;
  }
  .admin .log { margin: 0; padding: 0; list-style: none; font-size: 13px; color: var(--text-2); }
  .admin .confirm { max-width: 380px; margin: 48px auto; display: grid; gap: 14px; }
"""


def csrf_token(session_token: str) -> str:
    """Tied to the session cookie, which other sites can neither read nor guess."""
    return hmac.new(session_token.encode(), b"admin-csrf", hashlib.sha256).hexdigest()


def _page(title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>{escape(title)} · SafePay Labs</title>
  <meta name="theme-color" content="#f3ede2">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <link rel="stylesheet" href="/devs/style.css">
  <style>{_STYLE}</style>
</head>
<body class="admin">
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/devs/" aria-label="SafePay Labs, back to the portal">{_BRAND}</a>
      <nav aria-label="Sections"><a href="/devs/">← Back to the portal</a></nav>
      <form class="signout" method="post" action="/devs/logout">
        <button type="submit">Sign out</button>
      </form>
    </div>
  </header>
  <main>{body}</main>
</body>
</html>"""


def _when(at: datetime | None) -> str:
    return at.strftime("%Y-%m-%d %H:%M") + " UTC" if at else "never"


def _button(action: str, email: str, csrf: str, label: str, css: str = "") -> str:
    return (
        f'<form method="post" action="/devs/admin/{action}">'
        f'<input type="hidden" name="csrf" value="{csrf}">'
        f'<input type="hidden" name="email" value="{escape(email, quote=True)}">'
        f'<button type="submit" class="{css}">{label}</button></form>'
    )


def _confirmed(action: str, email: str, csrf: str, label: str, warning: str) -> str:
    """A two-click action: open the disclosure, then press the button inside it."""
    return (
        f'<details><summary class="danger">{label}</summary><p>{warning}</p>'
        + _button(action, email, csrf, f"Yes, {label.lower()}", "danger")
        + "</details>"
    )


def _row(r: Researcher, me: str, csrf: str) -> str:
    tags = ('<span class="tag admin-tag">Admin</span>' if r.is_admin else "") + (
        '<span class="tag off">Disabled</span>' if r.disabled else ""
    )
    you = '<span class="tag">You</span>' if r.email == me else ""
    actions = [
        _confirmed(
            "passwd", r.email, csrf, "New password",
            "Their current password stops working and they are signed out everywhere.",
        ),
        _button("signout", r.email, csrf, "Sign out everywhere"),
    ]
    if r.email != me:
        actions.append(
            _button("enable", r.email, csrf, "Enable")
            if r.disabled
            else _button("disable", r.email, csrf, "Disable")
        )
        actions.append(
            _button("revoke", r.email, csrf, "Remove admin")
            if r.is_admin
            else _confirmed(
                "grant", r.email, csrf, "Make admin",
                "Admins can create, change and remove every account, including yours.",
            )
        )
        actions.append(
            _confirmed(
                "remove", r.email, csrf, "Remove",
                "Deletes the account and signs them out. This cannot be undone.",
            )
        )
    return (
        f"<tr><td><b>{escape(r.name) or '—'}</b>{you}{tags}<br>"
        f'<span class="muted">{escape(r.email)}</span></td>'
        f"<td>{_when(r.last_seen_at)}</td>"
        f'<td><div class="row-actions">{"".join(actions)}</div></td></tr>'
    )


def _notice(result: Result | None) -> str:
    if result is None:
        return ""
    if not result.ok:
        return f'<p class="notice bad" role="alert">{escape(result.message)}</p>'
    secret = ""
    if result.password:
        secret = (
            f'<code class="secret">{escape(result.password)}</code>'
            "Copy this password now. It is shown once and cannot be shown again. "
            "Send it over a private channel; they sign in at <code>/devs/</code>."
        )
    return f'<div class="notice" role="status"><b>{escape(result.message)}</b>{secret}</div>'


def render_admin(
    researchers: list[Researcher],
    me: str,
    csrf: str,
    audit: list[AuditEntry],
    result: Result | None = None,
) -> str:
    rows = "".join(_row(r, me, csrf) for r in researchers)
    log = "".join(
        f"<li>{_when(e.at)} · {escape(e.actor)} {AUDIT_LABELS.get(e.action, escape(e.action))} "
        f"{escape(e.target)}</li>"
        for e in audit
    ) or "<li>Nothing yet.</li>"
    body = f"""
    <section class="view">
      <div class="heading">
        <h1>Manage devs</h1>
        <p>Create, block and remove portal accounts. Only admins can open this page.</p>
      </div>
      {_notice(result)}
      <article class="card">
        <h2>Add a dev</h2>
        <form class="add" method="post" action="/devs/admin/add">
          <input type="hidden" name="csrf" value="{csrf}">
          <label>Email <input type="email" name="email" required autocomplete="off"></label>
          <label>Name <input type="text" name="name" maxlength="100" autocomplete="off"></label>
          <button type="submit" class="primary">Create account</button>
        </form>
        <p class="muted">A password is generated and shown once on the next screen.</p>
      </article>
      <article class="card">
        <h2>Devs ({len(researchers)})</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Dev</th><th>Last signed in</th><th>Actions</th></tr></thead>
          <tbody>{rows}</tbody>
        </table></div>
      </article>
      <article class="card">
        <h2>Recent changes</h2>
        <ul class="log">{log}</ul>
      </article>
    </section>"""
    return _page("Manage devs", body)


def render_confirm(csrf: str, message: str = "") -> str:
    error = f'<p class="notice bad" role="alert">{escape(message)}</p>' if message else ""
    body = f"""
    <form class="card confirm" method="post" action="/devs/admin/confirm">
      <div>
        <h1>Confirm it's you</h1>
        <p class="muted">Enter your password to manage accounts. You'll be asked again after
        {ADMIN_CONFIRM_HOURS} hours.</p>
      </div>
      {error}
      <input type="hidden" name="csrf" value="{csrf}">
      <label>Password
        <input type="password" name="password" autocomplete="current-password" required autofocus>
      </label>
      <button type="submit" class="primary">Continue</button>
    </form>"""
    return _page("Confirm it's you", body)
