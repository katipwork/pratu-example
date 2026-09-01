# The five flows

Every request below is addressed to the tenant origin
(`http://acme.pratu.localhost:4433`). All of these were exercised against a real
Pratu v0.3.1 server; the responses shown are actual output.

Common shapes:

- **Flow** — `{id, kind, expires_at, state, ui: {fields, methods}, messages}`
- **AuthResult** — `{state, identity, session, session_token, verification}`
- `session_token` appears on API flows only; browser flows set a cookie.

---

## 1. Registration

```
POST /self-service/registration/api            → Flow
POST /self-service/registration?flow={id}      → AuthResult
```

The flow pins an Identity Schema version and tells you which traits to collect,
so the form is never hardcoded:

```json
{
  "id": "cadfb4b2-…", "kind": "registration", "state": "choose_method",
  "ui": { "fields": [
    { "name": "email",    "type": "string",   "title": "Email",    "required": true  },
    { "name": "name",     "type": "string",   "title": "Name",     "required": false },
    { "name": "password", "type": "password", "title": "Password", "required": true  }
  ]}
}
```

> `password` is listed among the fields but is **not a trait**. Submit it as its
> own top-level key; putting it in `traits` fails validation.

```jsonc
// POST /self-service/registration?flow=…
{ "method": "password",
  "traits": { "email": "nid@example.com", "name": "Nid" },
  "password": "correct-horse-battery-staple" }
```

Under the default `verification: required` policy the session is **withheld**:

```json
{ "state": "verification_required",
  "identity": { "…": "…" },
  "verification": { "flow_id": "a6ab7c75-…", "channel": "email",
                    "address": "n****@example.com" } }
```

No `session` and no `session_token` — continue to verification.

Password policy is NIST 800-63B: length (default 10) plus a breach check, and
deliberately **no composition rules**, so don't render "1 symbol, 1 digit" hints.

---

## 2. Verification

```
POST /self-service/verification?flow={id}         {code}
POST /self-service/verification/resend?flow={id}
```

Five wrong attempts invalidate the code. When the flow was spawned by a
session-withholding registration, success issues the session:

```json
{ "state": "verified", "identity": {…}, "session": {…, "aal": "aal1"},
  "session_token": "pst_BQMuEGhQPBib5kPe…" }
```

---

## 3. Login

```
POST /self-service/login/api           → Flow
POST /self-service/login?flow={id}     {method, identifier, password}
```

Three outcomes. **A 403 here is not a failure** — it means the password was
right and another step is owed:

```
                 ┌── 200 {state:"active", session_token}          ─▶ signed in
POST /login ─────┼── 403 {state:"verification_required", …}       ─▶ /verify
                 └── 403 {state:"mfa_required", methods:["sms"]}  ─▶ second factor
```

A tenant with `mfa: required` can also answer `200` with
`state: "mfa_enrollment_required"` — signed in, but must enrol a factor now.

This is why `submitLogin()` uses `requestRaw()` and inspects the status itself
instead of letting a non-2xx throw.

---

## 4. Second factor — including mobile OTP login

**The login flow stays alive.** Prove a factor against the same `flow` id and
the session is upgraded to `aal2`.

### TOTP

```
POST /self-service/login/totp?flow={id}   {code}   → AuthResult (aal2)
```

### SMS — the mobile OTP login

Two endpoints, because sending and proving are separate steps:

```
POST /self-service/login/sms/send?flow={id}   → {"state":"sent","address":"********5678"}
POST /self-service/login/sms?flow={id}  {code} → {"state":"active", session:{aal:"aal2"}, session_token}
```

Full journey as verified:

```
password ──▶ 403 {state:"mfa_required", methods:["sms"]}
         ──▶ POST /login/sms/send        {"state":"sent","address":"********5678"}
         ──▶ POST /login/sms {code}      {"state":"active","aal":"aal2"}
```

> **There is no passwordless "log in with your phone number" flow in v0.3.1.**
> The login submit accepts `method: "password"` only. SMS is a *second* factor
> for an already-enrolled identity. (Passwordless identities exist, but only as
> a by-product of social sign-in.) If you need phone-first login, it has to be
> built server-side or added upstream.

**Send caps** (`internal/server/limits.go`): 1 send per address per **minute**,
then 5/day for SMS and 20/day for email, plus a per-tenant daily SMS ceiling
because real pumping attacks rotate numbers. The cooldown is easy to hit while
testing — a `429` here is the server working correctly.

---

## 5. Recovery

Multi-step and uniformly anti-enumeration: the response is identical whether or
not the address exists, and even when a send cap suppressed delivery.

```
POST /self-service/recovery/api              → Flow
POST /self-service/recovery?flow={id}        {address}
     → {"state":"code_sent","message":"if the address exists, a code was sent to it"}
POST /self-service/recovery/code?flow={id}   {code}
     → {"state":"set_password"}                        ─▶ straight to the password screen
     → {"state":"second_factor_required","methods":["sms"]}  ─▶ MFA first
```

**Recovery never bypasses MFA.** The second-factor endpoints mirror login:

```
POST /self-service/recovery/totp?flow={id}      {code}  → {"state":"set_password"}
POST /self-service/recovery/sms/send?flow={id}          → {"state":"sent"}
POST /self-service/recovery/sms?flow={id}       {code}  → {"state":"set_password"}
```

Then:

```
POST /self-service/recovery/password?flow={id}  {password}
     → {"state":"recovered", session:{aal:"aal2"}, session_token}
```

Completing recovery replaces the credential, marks the recovery address
verified, **revokes every other session**, and issues a fresh one.

UI copy must stay conditional — "*if* that address belongs to an account" —
because the server deliberately tells you nothing.

> The uniform response hides **send caps too**. Register and then immediately
> ask to recover the same address: the verification email started a 60-second
> per-address cooldown, so no recovery code is sent, yet the API still answers
> `{"state": "code_sent"}`. The screen asks for a code that does not exist.
> Distinguishing the cases would leak account existence, so this is by design —
> budget for it in support docs and in tests.

---

## 6. MFA enrolment (needs a session)

```
POST   /self-service/mfa/totp/enroll                  → {flow_id, secret, uri}
POST   /self-service/mfa/totp/confirm?flow={id} {code} → {state:"enrolled", session:{aal:"aal2"}}
DELETE /self-service/mfa/totp                          (requires aal2)

POST   /self-service/mfa/sms/enroll   {phone}          → {flow_id, address:"********5678"}
POST   /self-service/mfa/sms/confirm?flow={id}  {code} → {state:"enrolled", session:{aal:"aal2"}}
DELETE /self-service/mfa/sms                           (requires aal2)
```

The TOTP secret stays **pending** until a code proves the authenticator holds
it. `uri` is an `otpauth://` URL ready for a QR code:

```
otpauth://totp/Acme%20Inc:nid@example.com?algorithm=SHA1&digits=6&issuer=…
```

Enrolling raises the current session to `aal2`, which is also what makes the
`DELETE` endpoints reachable — removing a factor requires having just proven
one.

Phone numbers are international format (`+66812345678`), and are stored
encrypted at rest.

Note that v0.3.1 has **no endpoint to list enrolled factors**. A settings screen
can only discover them from a `409` on re-enrolment, or from `methods` on a held
login.

---

## Cookie-session extras (not used here)

If you switch to browser flows, state-changing calls on a cookie session
(logout, session revocation, MFA enrolment, OAuth2 accept) additionally require
the session-scope CSRF token in an `X-CSRF-Token` header, bootstrapped from
`GET /sessions/whoami`. Header-token requests never need CSRF, which is one more
reason this example uses them.
