# Researcher portal access

The research views (benchmark, score sandbox, roadmap board, library, documents) live at `/portal/` on the project site and are for researchers only. There is no sign-up or sign-in page. An account is created from the terminal by a researcher who already has project access, and your browser then asks for the email and password itself. Background: [ADR 008](decisions/008-public-landing-and-researcher-portal.md).

Which part you need:

- **You were given a login** → [Signing in](#signing-in).
- **You need an account** → ask a researcher who manages accounts; they follow [Creating an account](#creating-an-account).
- **You manage accounts** → [One-time setup](#one-time-setup-for-whoever-manages-accounts), then [Creating an account](#creating-an-account) and [Managing accounts](#managing-accounts).
- **You only want to look at the portal on your own machine** → [Running it locally](#running-it-locally). No account or database needed.

## Signing in
1. Open the project site's address followed by `/portal/`.
2. Your browser shows its own small pop-up asking for a username and password. This is expected; there is no web form.
3. **Username** is your email address. **Password** is the one you were sent.
4. The portal loads. The browser remembers the login until you close it.

Good to know:

- **Save the password in a password manager.** Nobody can look it up for you: only a scrambled form is stored. If you lose it, ask for a new one.
- **Signing out:** there is no sign-out button. Close the browser. On a shared computer, use a private window.
- **The pop-up keeps coming back:** the email or password is wrong. Check for a stray space when pasting.
- **"Too many failed attempts":** ten wrong tries in 15 minutes locks the email and the network address you tried from. Wait 15 minutes, or ask an account manager to clear it.
- **Don't share a login.** Each researcher gets their own, so one can be switched off without affecting the others.

## One-time setup (for whoever manages accounts)
You need:

- this repository cloned, with `npm ci` run once;
- [uv](https://docs.astral.sh/uv/) (`brew install uv`, or see its site);
- the Vercel CLI (`npm i -g vercel`) and membership of the Vercel team that owns the `payment-integration-lab` project. Ask the project owner to invite you. This is what gives you the database address.

Then, from the repository root:

```sh
vercel login
vercel link                      # choose the payment-integration-lab project
vercel env pull .env.local       # writes DATABASE_URL into a git-ignored file
uv sync --locked                 # installs the Python tools
npm run researcher -- init       # creates the database tables; safe to run again
npm run researcher -- list       # should print "0 researcher(s)." or the current list
```

If `list` prints a list or a zero count, you are set up.

## Creating an account
```sh
npm run researcher -- add ada@example.org --name "Ada Lovelace"
```

It prints:

```
Researcher created.
  username: ada@example.org
  password: <24 random characters>
Shown once and not stored. Send it over a private channel.
```

What to do with that output:

1. **Copy the password now.** It is shown once. Closing the terminal loses it for good.
2. **If the account is yours,** save it in your password manager and go to [Signing in](#signing-in).
3. **If it is for someone else,** send them the username and password over a private channel: a password-manager share or an end-to-end encrypted message. Not email, not a chat channel, not an issue or pull request.
4. Point them at [Signing in](#signing-in).
5. Clear your terminal's scrollback if others can see your screen.

If something went wrong before the password reached them, issue a new one with `passwd` (below); the old one stops working.

## Managing accounts
| Task | Command |
|---|---|
| See everyone and when they last signed in | `npm run researcher -- list` |
| Issue a new password (lost, or possibly seen by someone else) | `npm run researcher -- passwd <email>` |
| Block someone without deleting them | `npm run researcher -- disable <email>` |
| Unblock | `npm run researcher -- enable <email>` |
| Delete | `npm run researcher -- remove <email>` |

- Changes take up to a minute to take effect, because a running server trusts a password it has just checked for 60 seconds.
- When someone leaves the project, `disable` or `remove` them the same day, and remove them from the Vercel team and the GitHub repository too.
- To clear a lockout, run `DELETE FROM auth_failures;` in the Neon SQL editor (Vercel dashboard → Storage → the database → Open in Neon).

## Running it locally
```sh
npm run site
```

This serves the public page at `http://127.0.0.1:4173/` and the portal at `http://127.0.0.1:4173/portal/`. It prints a throwaway username and password when it starts; type those into the browser's pop-up. They work for that run only and have nothing to do with the real accounts or database. Press `Ctrl+C` to stop.

## Rules
- **Never commit** `.env.local`, a password, or a database address. `.env.local` is already git-ignored; keep it that way.
- **Never paste a password** into an issue, a pull request, a commit message or a chat channel.
- If a password or the database address may have been exposed, issue a new password with `passwd` straight away and tell the project owner.
