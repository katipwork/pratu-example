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
| **Mobile OTP login** | `/login` | Password → SMS one-time code → `aal2`, in place |
| **2FA** | `/login`, `/mfa` | TOTP with QR enrolment, SMS enrolment |
| **Recovery** | `/recovery` | Code → second factor → new password, driven by flow state |
| **Session** | `/dashboard` | `whoami`, assurance level, unenrolment |

## Quick start

```bash
docker compose up --build
```

Builds Pratu from the pinned tag, migrates, creates the `acme` tenant and serves
everything on one origin at <http://acme.pratu.localhost:8080>. One-time codes
go to the Pratu log:

```bash
docker compose logs -f pratu | grep courier
```

Or run against your own Pratu server. The app needs no configuration — it calls
Pratu on relative paths — but it must share an origin with it, so run the
bundled `Caddyfile` alongside:

```bash
pnpm install
pnpm dev                          # Next.js on :3000
caddy run --config Caddyfile      # :8080 → app + Pratu, one origin
```

## Docs

- **[docs/setup.md](docs/setup.md)** — run Pratu, create a tenant, read one-time
  codes from the dev courier, walk each flow, troubleshoot.
- **[docs/flows.md](docs/flows.md)** — every endpoint with real request and
  response bodies, and the branching each flow can take.
- **[docs/architecture.md](docs/architecture.md)** — why browser flows need one
  origin, the two CSRF scopes, how flows are carried across screens, and the
  traps found while building this.

## How it talks to Pratu

Entirely through **browser flows**: the browser calls Pratu directly, on the
same origin, and the session is an HttpOnly `pratu_session` cookie that no
script can read. The Next.js server never touches the auth API — every route
builds as static.

```
browser ──fetch (same-origin, cookies + CSRF)──▶ Caddy ──▶ Pratu
                                                  └─────▶ Next.js (the shell)
```

Four things worth knowing before you read the code:

- **One origin is mandatory.** Pratu's cookies are host-scoped to the tenant and
  the server has no CORS, so a reverse proxy fronts both. Open the app at
  `acme.pratu.localhost:8080`, never `localhost`.
- **There are two CSRF scopes.** Flow submissions send `csrf_token` in the body;
  session-scoped calls (logout, MFA) send the token from `whoami` in an
  `X-CSRF-Token` header.
- A **403 on login is not a failure** — it is how "password accepted, now prove
  your second factor" is expressed.
- **v0.3.1 has no passwordless phone login.** SMS is a second factor; login
  itself is `method: "password"` only.

## Layout

```
apps/web/src/
├── lib/pratu/     transport, typed endpoints, useFlow / useSession
├── components/    UI plus the shared second-factor step
└── app/…          one directory per screen

Caddyfile            puts the app and Pratu on one origin
docker-compose.yml   postgres + pratu v0.3.1 + this app + caddy
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
