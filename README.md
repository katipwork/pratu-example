# pratu-example

A Next.js front end for every self-service flow of
[Pratu](https://github.com/katipwork/pratu) **v0.4.0** — registration, login,
address verification, account recovery, TOTP and SMS two-factor, and mobile OTP
login.

Pratu is headless: it ships an API and no UI. This is the UI, written the way a
tenant would write its own.

## Two tenants, one app

Pratu picks the tenant from the Host header, so the same screens serve two
very different products — and nothing in the code is tenant-specific. Each
screen renders what the flow advertises through `ui.fields` and `ui.methods`.

| | |
|---|---|
| <http://acme.pratu.localhost:8080> | email + password, optional second factor |
| <http://otp.pratu.localhost:8080> | **passwordless**: mobile number + One-Time Code |

The passwordless tenant sets `first_factor: ["code"]` (ADR 0007) and an Identity
Schema whose only trait is the phone — which is both the login identifier and
the address the code goes to. There is no password field anywhere in it, and no
"forgot password" link, because there is no password to forget.

## What's covered

| Flow | Screens | Notes |
|---|---|---|
| **Registration** | `/register` → `/verify` | Fields come from the tenant's Identity Schema |
| **Login** | `/login` | Branches into verification or a second factor |
| **Mobile OTP login** | `/login` | Password → SMS one-time code → `aal2`, in place |
| **2FA** | `/login`, `/mfa` | TOTP with server-rendered QR, SMS enrolment |
| **Recovery** | `/recovery` | Code → second factor → new password, driven by flow state |
| **Session** | `/dashboard` | `whoami`, assurance level, unenrolment |
| **Passwordless** | `/register`, `/login` | Mobile number + code, no credential stored |
| **Failures** | `/error` | `?code=` landings: expired flow, CSRF, rate limit |

## Quick start

```bash
docker compose up --build
```

Builds Pratu from the pinned tag, migrates, creates both tenants and serves
them at <http://acme.pratu.localhost:8080> and
<http://otp.pratu.localhost:8080>.

Pratu sends no mail or SMS of its own, so one-time codes land in a small dev
mailbox at <http://localhost:8025> — leave it open while you click through a
flow and click a code to copy it.

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

Entirely through **redirect-driven browser flows** — the mode v0.3.0 was built
around. Plain HTML forms post straight to Pratu, which answers `303` and sends
the browser back to the tenant's own screens carrying the flow. Screens render
on the server.

**No JavaScript takes part.** Both end-to-end suites run with scripts disabled.

```
GET /login  ──307──▶  /self-service/login/browser
                        └──303──▶  /login?flow=abc   (screen reads the flow)

POST /self-service/login?flow=abc   (urlencoded form)
   ├─ wrong password ──303──▶ /login?flow=abc  + message on the flow
   ├─ needs a factor ──303──▶ /login?flow=abc  + state: mfa_required
   └─ success        ──303──▶ /dashboard
```

Four things worth knowing before you read the code:

- **One origin is mandatory.** Pratu's cookies are host-scoped to the tenant and
  the server has no CORS, so Caddy fronts both. Open the app at
  `acme.pratu.localhost:8080`, never `localhost`.
- **The tenant's `ui` block is load-bearing.** With no screens configured Pratu
  has nowhere to redirect and quietly answers JSON instead — the `bootstrap`
  service sets them.
- **Two CSRF scopes.** Flow submissions carry `csrf_token` as a hidden field;
  logout and MFA need it in an `X-CSRF-Token` header, which a form cannot set —
  those go through a server action.
- **Passwordless is per tenant, not per app.** `first_factor` decides whether a
  tenant takes a password, a code, or either; the UI reads it from the flow
  rather than being told.

## Layout

```
apps/web/src/
├── lib/pratu/     transport, typed endpoints, useFlow / useSession
├── components/    UI plus the shared second-factor step
└── app/…          one directory per screen

Caddyfile             puts the app and Pratu on one origin
docker-compose.yml    postgres + pratu v0.4.0 + app + caddy + mailbox
docker/bootstrap/     creates both tenants and the phone-only Identity Schema
docker/courier/       dev mailbox: catches courier webhooks, shows the codes
docker/devdb/         creates the unprivileged role Pratu requires
apps/web/Dockerfile   standalone Next.js build
```

This is a pnpm workspace (`apps/*`, `packages/*`) with Turborepo, so a second
app or a shared package drops in without restructuring.

## Verified against a real server

All three journeys were driven end to end through the UI with Playwright against
Pratu v0.4.0: register → verify → enrol SMS → sign out → password → SMS OTP →
`aal2`; and register → verify → enrol TOTP → TOTP login → recovery with a second
factor → new password, with the old password correctly rejected afterwards.
