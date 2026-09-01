# Running this example

You need a Pratu v0.3.1 server with one tenant, and this Next.js app pointed at
it.

## 1. Run Pratu

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

## 2. Create a tenant

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

## 3. Run the app

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

`.env.local` holds the tenant origin — the whole config:

```bash
PRATU_TENANT_URL=http://acme.pratu.localhost:4433
```

Open <http://localhost:3000>.

## 4. Read the one-time codes

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
   is enrolled you are held at `/login/mfa`; press *Text me a code*.
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

**"Cannot reach the Pratu server"** — the origin in `PRATU_TENANT_URL` must be
the tenant hostname, not `127.0.0.1`. Pratu picks the tenant from the Host
header, and Node's `fetch` cannot fake it. See
[architecture.md](architecture.md).

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

**Port already in use** — override with
`PRATU_PUBLIC_LISTEN=":14433" PRATU_ADMIN_LISTEN=":14434"`, and update
`PRATU_TENANT_URL` to match.
