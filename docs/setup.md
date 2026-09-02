# Running this example

You need a Pratu v0.3.1 server with one tenant, and this Next.js app pointed at
it. Either let Docker do all of it, or run the two halves yourself.

## Option A — Docker Compose (everything at once)

```bash
docker compose up --build
```

That builds Pratu from the pinned tag, migrates, starts it, creates the `acme`
tenant, and serves the UI:

| | |
|---|---|
| **App + auth API (one origin)** | <http://acme.pratu.localhost:8080> |
| Admin API | <http://localhost:4434> (`Authorization: Bearer devroot`) |

**Use the tenant hostname, not `localhost`.** Browser flows put the session and
CSRF cookies on `acme.pratu.localhost`, and the API has no CORS — opening the
app on `localhost:8080` gives you a UI that cannot sign anyone in.

A cold start from an empty volume takes about ten seconds. Read one-time codes
from the Pratu log:

```bash
docker compose logs -f pratu | grep courier
```

Override anything in `.env` (see `.env.example`) — ports collide often:

```bash
APP_PORT=8080
PRATU_PUBLIC_PORT=4533
PRATU_ADMIN_PORT=4534
```

Three details worth knowing about the compose file:

- **Caddy is the only web port you use.** It puts the app and Pratu on one
  origin, which browser flows require: the cookies are host-scoped to the
  tenant and there is no CORS. Pratu's own port is published only so you can
  curl it directly.
- **Postgres runs as `postgres`, not `pratu`.** Pratu refuses to start on a role
  with `SUPERUSER` or `BYPASSRLS`, because its row-level-security policies
  would be silently inert. `docker/devdb/01-app-role.sql` creates the
  unprivileged `pratu` role, mirroring upstream's own dev bootstrap.

Teardown, including the database volume:

```bash
docker compose down -v
```

## Option B — run the pieces yourself

### 1. Run Pratu

```bash
git clone https://github.com/katipwork/pratu
cd pratu && git checkout v0.3.1
cp pratu.example.yaml pratu.yaml
```

Fill in three values in `pratu.yaml` that ship empty:

```yaml
admin:
  root_key: "devroot"                 # enables the admin API
encryption:
  keys: ["a-dev-key-at-least-32-characters!!"]   # TOTP secrets, phones, keys
oauth2:
  system_secret: "another-32-char-minimum-secret!!"  # only if you use OAuth2
courier:
  driver: log                          # one-time codes print to the log
```

Then:

```bash
make db-up      # postgres on :35432
make migrate
make run        # public :4433, admin :4434
```

### 2. Create a tenant

The tenant slug plus `base_domain` forms the hostname the app will call.

```bash
curl -X POST http://127.0.0.1:4434/admin/tenants \
  -H "Authorization: Bearer devroot" \
  -H "Content-Type: application/json" \
  -d '{"slug":"acme","name":"Acme Inc"}'
```

Check it answers on its hostname:

```bash
curl http://acme.pratu.localhost:4433/health/alive   # {"status":"ok"}
```

`*.localhost` resolves to loopback with no DNS setup. It resolves to **`::1`**,
so Pratu must be listening dual-stack — the default `":4433"` is.

### 3. Run the app behind a proxy

The app needs no configuration at all — it calls Pratu on relative paths. What
it does need is to be served from the same origin as Pratu, so run the bundled
`Caddyfile` alongside it:

```bash
pnpm install
pnpm dev                                    # Next.js on :3000

# in another shell
caddy run --config Caddyfile                # :8080 → app + Pratu
```

The defaults point at `localhost:3000` and `localhost:4433`; override with
`WEB_UPSTREAM` and `PRATU_UPSTREAM` if you moved either.

Open <http://acme.pratu.localhost:8080> — **not** `localhost:3000`, which would
put the app on a different origin from the cookies.

### 4. Read the one-time codes

The dev courier is `driver: log`, so codes are printed rather than delivered:

```bash
# whatever terminal `make run` is in, or:
grep -oE '"code":"[0-9]+"' server.log | tail -1
```

```json
{"msg":"courier message (log driver, not delivered)","channel":"email",
 "recipient":"nid@example.com","template":"verification_code",
 "payload":{"code":"685628","tenant":"Acme Inc"}}
```

## Walking every flow

1. **Register** at `/register` — traits come from the tenant's Identity Schema.
   You land on `/verify`; paste the code from the log.
2. **Two-factor** at `/mfa` — scan the QR with any authenticator app, or enrol a
   phone (`+66812345678`) and read its code from the log.
3. **Mobile OTP login** — sign out, sign in with your password. Because a phone
   is enrolled the second factor appears in place on `/login`; press
   *Text me a code*.
4. **Recovery** at `/recovery` — the emailed code, then your second factor, then
   a new password. Every other session is revoked.

> **Send cooldown — the one that will confuse you.** Pratu allows **one send per
> address per minute** (then 5/day for SMS, 20/day for email), per channel.
>
> For SMS this surfaces honestly as `429 too many requests`: enrol a phone and
> immediately log in, and the OTP send is refused. Wait 60 seconds.
>
> For **recovery it is silent**. Recovery is anti-enumeration, so it answers
> `{"state": "code_sent"}` *even when a cap suppressed the delivery*. Register
> (which sends a verification email) and then immediately request recovery for
> the same address, and the screen will happily ask for a code that was never
> sent. Wait out the minute. This is deliberate: telling you the difference
> would leak whether the account exists.

## Tenant settings worth knowing

Set on the tenant row through the admin API:

| Field | Effect |
|---|---|
| `verification` | `required` (session withheld until verified) or `deferred` |
| `mfa` | `off`, `optional`, or `required` |
| `password.min_length` | default 10 |
| `sms_daily_cap` | per-tenant SMS ceiling |
| `ui.login_url` etc. | where OAuth2 challenges send the browser |

With `mfa: required`, login answers `200 {state: "mfa_enrollment_required"}` for
an identity with no factor — this app routes that to `/mfa`.

## Troubleshooting

**Sign-in silently fails, or every submission answers 403** — you are almost
certainly on the wrong origin. Open the app at `http://acme.pratu.localhost:8080`;
on `localhost:8080` the tenant does not resolve, and on `localhost:3000` the
app bypasses the proxy entirely so the cookies never match. See
[architecture.md](architecture.md).

**`csrf_violation` / 403 on a submission** — the flow's `csrf_token` was not
sent in the body, or the `pratu_csrf` cookie was dropped. Both halves are
required. Session-scoped calls (logout, MFA) need the *other* token, from
`whoami`, in an `X-CSRF-Token` header.

**404 / "tenant not found"** — the slug in the hostname has no tenant row, or
`base_domain` in `pratu.yaml` does not match the hostname you are calling.

**`429` on a code send** — the per-address minute cooldown. Wait it out.

**Recovery asks for a code that never arrives** — almost always the same
cooldown, hidden by anti-enumeration. Check the server log for a
`"template":"recovery_code"` line; if there is none, a cap suppressed it.

**Codes appear in the log a little late** — the courier is an outbox drained on
a ticker, so a code lands a second or two after the request returns (longer if
the outbox is retrying). Match on `recipient` *and* `template`, since one
address receives `verification_code`, `recovery_code`, `mfa_code` and
`mfa_enroll_code` over a session.

**Port already in use** — with Docker, set `APP_PORT` / `PRATU_PUBLIC_PORT` /
`PRATU_ADMIN_PORT` in `.env`. Running Pratu directly, override
`PRATU_PUBLIC_LISTEN=":14433" PRATU_ADMIN_LISTEN=":14434"` and point
`PRATU_UPSTREAM` at the new port when starting Caddy.
