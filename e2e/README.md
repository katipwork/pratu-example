# End-to-end tests

Three Playwright scripts that drive the real UI against a real Pratu v0.3.1
server, **with JavaScript disabled** — which is the point: the flows are
redirect-driven, so scripts off is the honest test. They read one-time codes
from the dev mailbox, so Pratu must be running with `courier.driver: webhook`
pointed at it, which is what `docker compose up` sets up.

```bash
npm i playwright        # or pnpm add -w playwright
node e2e/mobile-otp.mjs
node e2e/totp-recovery.mjs
node e2e/passwordless.mjs
```

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://acme.pratu.localhost:8080` | password tenant (**not** localhost) |
| `OTP_BASE_URL` | `http://otp.pratu.localhost:8080` | passwordless tenant |
| `MAILBOX_URL` | `http://localhost:8025` | dev mailbox holding the one-time codes |

**mobile-otp.mjs** — assert `/login` is reached by redirect with `?flow=` →
register → verify email → assert the session is a HttpOnly `pratu_session`
cookie → enrol SMS second factor → sign out → password login held in place →
SMS OTP → `aal2`.

**totp-recovery.mjs** — register → verify → enrol TOTP (server-rendered QR) →
TOTP login → assert a wrong password returns to the screen with the message
persisted on the flow → recovery with a second factor → new password → old
password rejected.

Both wait out Pratu's 60-second per-address send cooldown where needed; each run
takes a couple of minutes because of it.

**passwordless.mjs** — register with a mobile number and nothing else (asserting
the flow neither shows nor accepts a password) → prove the number by SMS code →
sign out → sign in with number + One-Time Code → assert `aal1`, since one factor
is one factor → assert an unknown number gets an identical answer.
