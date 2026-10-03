# Researcher portal access

The research views (benchmark, score sandbox, roadmap board, library, documents) live at `/devs/` on the project site and are for researchers only. There is no sign-up page. An admin creates each account on the admin page at `/devs/admin`; you then sign in once at `/devs/` and that browser stays signed in. Background: [ADR 008](decisions/008-public-landing-and-researcher-portal.md).

Which part you need:

- **You were given a login** → [Signing in](#signing-in).
- **You need an account** → ask an admin; they follow [Managing devs on the admin page](#managing-devs-on-the-admin-page).
- **You are an admin** → [Managing devs on the admin page](#managing-devs-on-the-admin-page).
- **Someone is leaving the project** → [When someone leaves](#when-someone-leaves).
- **There is no admin yet, or the admin page is unavailable** → [Terminal fallback](#terminal-fallback).
- **You only want to look at the portal on your own machine** → [Running it locally](#running-it-locally). No account or database needed.

## Signing in
1. Open the project site's address followed by `/devs/`.
2. Type your email and the password you were sent into the "Dev sign in" form.
3. The portal loads. That is the only time you sign in on that browser: it stays signed in for 90 days, and every visit resets the 90 days.

Good to know:

- **Save the password in a password manager.** Nobody can look it up for you: only a scrambled form is stored. If you lose it, ask for a new one. You will need it again for each new browser or device.
- **Signing out:** use the **Sign out** button at the top right of the portal. Do this on a shared computer.
- **"That email and password don't match":** check for a stray space when pasting.
- **"Too many failed attempts":** ten wrong tries in 15 minutes locks the email and the network address you tried from. Wait 15 minutes, or ask an account manager to clear it.
- **Lost or stolen laptop:** ask an account manager to run `signout` for your email. It signs you out everywhere.
- **Don't share a login.** Each researcher gets their own, so one can be switched off without affecting the others.

## Managing devs on the admin page
Sign in, then choose **Admin** in the portal's top bar (or open `/devs/admin`). The link and the page exist only for admins; to everyone else the address looks like a page that doesn't exist.

The page opens straight away if you typed your password in the last 12 hours. After that it asks for your password once more, so in practice about once a day. That way a browser left signed in can't be used to change accounts.

| To do this | Do this |
|---|---|
| Add a dev | Fill in **Add a dev** and press **Create account**. The next screen shows their password once. |
| Give a dev a new password | **New password** → confirm. Shows the new password once and signs them out everywhere. |
| Sign a dev out of every browser (lost laptop) | **Sign out everywhere** |
| Block a dev but keep the account | **Disable** (and **Enable** to undo) |
| Delete a dev | **Remove** → confirm |
| Let another dev manage accounts | **Make admin** → confirm (and **Remove admin** to undo) |

When a password is shown:

1. **Copy it straight away.** It is shown once; leaving or reloading the page loses it. If that happens, press **New password**.
2. **If it's for someone else,** send them their email and the password over a private channel: a password-manager share or an end-to-end encrypted message. Not email, not a chat channel, not an issue or pull request.
3. Point them at [Signing in](#signing-in).

Good to know:

- Changes take up to a minute to reach a dev who is already signed in.
- You can't disable, remove or demote your own account, so you can't lock yourself out. Another admin can.
- **Recent changes** at the bottom lists who did what, including changes made from the terminal.
- Keep the number of admins small. An admin can remove any account, including other admins.

## When someone leaves
Do all of these the same day. The portal login is only one of the ways in.

1. **Portal:** on the admin page, press **Remove** next to their name. Their account is deleted and they are signed out of every browser within a minute. Use **Disable** instead if they may come back.
2. **GitHub:** remove them as a collaborator (repository → Settings → Collaborators). The repository holds the research data the portal shows.
3. **Vercel, only if they were ever a team member:** remove them from the team (team → Settings → Members). Then reset the database password, because anyone who ran `vercel env pull` keeps a copy of it: in Neon (Vercel dashboard → Storage → the database → Open in Neon → Roles → reset password), redeploy the site, and run `vercel env pull .env.local` again yourself.

Devs who only ever used the portal and the admin page never held the database password, so for them steps 1 and 2 are enough. This is the reason to prefer the admin page over giving people terminal access.

## Terminal fallback
The terminal tool does everything the admin page does, straight against the database. You need it once, to create the first admin, and it is the way back in if every admin is locked out.

Setup (needs [uv](https://docs.astral.sh/uv/), the Vercel CLI, and membership of the Vercel team that owns the `payment-integration-lab` project):

```sh
vercel link                      # choose the payment-integration-lab project
vercel env pull .env.local       # writes DATABASE_URL into a git-ignored file
uv sync --locked
npm run researcher -- init       # creates or upgrades the tables; safe to run again
```

Create the first admin:

```sh
npm run researcher -- add you@example.org --name "Your Name"   # prints a password once
npm run researcher -- grant you@example.org                    # makes that account an admin
```

Everything else: `npm run researcher -- list`, and `passwd`, `signout`, `disable`, `enable`, `remove`, `grant`, `revoke` followed by an email. Run `init` again after pulling changes that touch `portal/schema.sql`. To clear a sign-in lockout early, run `DELETE FROM auth_failures;` in the Neon SQL editor.

## Running it locally
```sh
npm run site
```

This serves the public page at `http://127.0.0.1:4173/` and the portal at `http://127.0.0.1:4173/devs/`. Sign in with the local-only login it prints (`dev@localhost` / `localdev`); your browser can save it. That local login is an admin, so `http://127.0.0.1:4173/devs/admin` works too. It has nothing to do with the real accounts or database. You sign in again after restarting the server, because local sessions are kept in memory. Press `Ctrl+C` to stop.

## Rules
- **Never commit** `.env.local`, a password, or a database address. `.env.local` is already git-ignored; keep it that way.
- **Never paste a password** into an issue, a pull request, a commit message or a chat channel.
- If a password or the database address may have been exposed, issue a new password with `passwd` straight away and tell the project owner.
