# End-to-end tests

Two Playwright scripts that drive the real UI against a real Pratu v0.3.1
server. They read one-time codes out of the server log, so Pratu must be running
with `courier.driver: log`.

```bash
npm i playwright        # or pnpm add -w playwright
node e2e/mobile-otp.mjs
node e2e/totp-recovery.mjs
```

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://acme.pratu.localhost:8080` | the proxied origin (**not** localhost) |
| `PRATU_LOG` | `/tmp/pratu-server.log` | Pratu's stdout, for reading codes |

**mobile-otp.mjs** — register → verify email → assert the session is a
HttpOnly `pratu_session` cookie → enrol SMS second factor → sign out → password
login held in place → SMS OTP → `aal2`.

**totp-recovery.mjs** — register → verify → enrol TOTP (QR + generated code) →
TOTP login → recovery with a second factor → new password → old password
rejected.

Both wait out Pratu's 60-second per-address send cooldown where needed; each run
takes a couple of minutes because of it.
