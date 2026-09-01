# pratu-example

A Next.js front end for every self-service flow of
[Pratu](https://github.com/katipwork/pratu) **v0.3.1** — registration, login,
address verification, account recovery, TOTP and SMS two-factor, and mobile OTP
login.

Pratu is headless: it ships an API and no UI. This is the UI, written the way a
tenant would write its own.

## What's covered

| Flow | Screens | Notes |
|---|---|---|
| **Registration** | `/register` → `/verify` | Fields come from the tenant's Identity Schema |
| **Login** | `/login` | Branches into verification or a second factor |
| **Mobile OTP login** | `/login/mfa` | Password → SMS one-time code → `aal2` |
| **2FA** | `/login/mfa`, `/mfa` | TOTP with QR enrolment, SMS enrolment |
| **Recovery** | `/recovery/…` | Code → second factor → new password |
| **Session** | `/dashboard` | `whoami`, assurance level, unenrolment |

## Quick start

```bash
docker compose up --build
```

Builds Pratu from the pinned tag, migrates, creates the `acme` tenant and serves
the UI on <http://localhost:3000>. One-time codes go to the Pratu log:

```bash
docker compose logs -f pratu | grep courier
```

Or run against your own Pratu server:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

One environment variable, the tenant origin:

```bash
PRATU_TENANT_URL=http://acme.pratu.localhost:4433
```

## Docs

- **[docs/setup.md](docs/setup.md)** — run Pratu, create a tenant, read one-time
  codes from the dev courier, walk each flow, troubleshoot.
- **[docs/flows.md](docs/flows.md)** — every endpoint with real request and
  response bodies, and the branching each flow can take.
- **[docs/architecture.md](docs/architecture.md)** — why API flows instead of
  browser flows, how sessions and multi-step flows are carried, and the traps
  found while building this.

## How it talks to Pratu

All calls happen **server-side** through Pratu's *API flows*, which return an
opaque `session_token` instead of setting cookies. The token lives in this app's
own HttpOnly cookie and never reaches client JavaScript.

The alternative — *browser flows* — needs your UI and Pratu on the same
hostname behind a reverse proxy, because Pratu's cookies are host-scoped and it
supports no CORS. API flows avoid that entirely.

```
browser ──form POST──▶ server action ──X-Session-Token──▶ Pratu
```

Three things worth knowing before you read the code:

- Pratu selects the tenant from the **Host header**, and Node's `fetch` silently
  drops a manually set `Host`. The tenant hostname has to be the real URL.
- A **403 on login is not a failure** — it is how "password accepted, now prove
  your second factor" is expressed.
- **v0.3.1 has no passwordless phone login.** SMS is a second factor; login
  itself is `method: "password"` only.

## Layout

```
apps/web/src/
├── lib/pratu/     client, typed endpoints, session + flow cookies
├── app/actions.ts server actions — the state machine of every flow
└── app/…          one directory per screen

docker-compose.yml   postgres + pratu v0.3.1 + this app
docker/devdb/        creates the unprivileged role Pratu requires
apps/web/Dockerfile  standalone Next.js build
```

This is a pnpm workspace (`apps/*`, `packages/*`) with Turborepo, so a second
app or a shared package drops in without restructuring.

## Verified against a real server

Both journeys were driven end to end through the UI with Playwright against
Pratu v0.3.1: register → verify → enrol SMS → sign out → password → SMS OTP →
`aal2`; and register → verify → enrol TOTP → TOTP login → recovery with a second
factor → new password, with the old password correctly rejected afterwards.
