# The five flows

Every request below is same-origin against the tenant
(`http://acme.pratu.localhost:8080`, the proxy). All of these were exercised
against a real Pratu v0.4.0 server; the responses shown are actual output.

These are **browser flows**, so:

- Every submission carries the flow's `csrf_token` **in the body**. Omitting it
  answers `403`.
- Success sets the `pratu_session` cookie and returns **no** `session_token`.
- Session-scoped calls (logout, MFA management) carry the token from `whoami`
  in an `X-CSRF-Token` **header** instead.

**The JSON below is what a JSON client sees.** This app is not one: it posts
`application/x-www-form-urlencoded`, which Pratu treats as an HTML client, so
each response is a `303` back to the tenant's screen instead — the outcome is
carried by the flow's `state` and `messages` rather than the body. Same
endpoints, same tokens, different envelope. See
[architecture.md](architecture.md#the-redirect-loop).

In form posts, traits nest by name: `traits.email=…` rather than a `traits`
object.

Common shapes:

- **Flow** — `{id, kind, expires_at, state, csrf_token, ui: {fields, methods}, messages}`
- **AuthResult** — `{state, identity, session, verification}`

---

## 1. Registration

```
GET  /self-service/registration/browser        → Flow  (sets the CSRF cookie)
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
  "password": "correct-horse-battery-staple",
  "csrf_token": "dyso0bQmVs-0z_Uy6PwYz_NfWyZ4-p9MPSzw3jdBG0o" }
```

Without `csrf_token` the same request answers `403`.

Under the default `verification: required` policy the session is **withheld**:

```json
{ "state": "verification_required",
  "identity": { "…": "…" },
  "verification": { "flow_id": "a6ab7c75-…", "channel": "email",
                    "address": "n****@example.com" } }
```

No `session` and no cookie yet — continue to verification.

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
{ "state": "verified", "identity": {…}, "session": {…, "aal": "aal1"} }
```

The `pratu_session` cookie is set on this response; there is no token to keep.

---

## 3. Login

```
GET  /self-service/login/browser       → Flow
POST /self-service/login?flow={id}     {method, identifier, password, csrf_token}
```

Three outcomes. **A 403 here is not a failure** — it means the password was
right and another step is owed:

```
                 ┌── 200 {state:"active"} + Set-Cookie            ─▶ signed in
POST /login ─────┼── 403 {state:"verification_required", …}       ─▶ /verify
                 └── 403 {state:"mfa_required", methods:["sms"]}  ─▶ second factor
```

A tenant with `mfa: required` can also answer `200` with
`state: "mfa_enrollment_required"` — signed in, but must enrol a factor now.

This is why the client returns `{ok, status, data}` and the screen inspects the
status itself, rather than treating any non-2xx as failure.

---

## 4. Second factor — including mobile OTP login

**The login flow stays alive.** Prove a factor against the same `flow` id and
the session is upgraded to `aal2`.

### TOTP

```
POST /self-service/login/totp?flow={id}   {code, csrf_token}   → AuthResult (aal2)
```

### SMS — the mobile OTP login

Two endpoints, because sending and proving are separate steps:

```
POST /self-service/login/sms/send?flow={id}  {csrf_token}        → {"state":"sent","address":"********5678"}
POST /self-service/login/sms?flow={id}       {code, csrf_token}  → {"state":"active", session:{aal:"aal2"}}
```

The held login is still the same flow — same id, same `csrf_token`.

Full journey as verified:

```
password ──▶ 403 {state:"mfa_required", methods:["sms"]}
         ──▶ POST /login/sms/send        {"state":"sent","address":"********5678"}
         ──▶ POST /login/sms {code}      {"state":"active","aal":"aal2"}
```

> This is SMS as a **second** factor. For SMS as the *only* factor, see
> [Passwordless](#7-passwordless-first-factor) below — added in v0.4.0.

**Send caps** (`internal/server/limits.go`): 1 send per address per **minute**,
then 5/day for SMS and 20/day for email, plus a per-tenant daily SMS ceiling
because real pumping attacks rotate numbers. The cooldown is easy to hit while
testing — a `429` here is the server working correctly.

---

## 5. Recovery

Multi-step and uniformly anti-enumeration: the response is identical whether or
not the address exists, and even when a send cap suppressed delivery.

```
GET  /self-service/recovery/browser          → Flow
POST /self-service/recovery?flow={id}        {address, csrf_token}
     → {"state":"code_sent","message":"if the address exists, a code was sent to it"}
POST /self-service/recovery/code?flow={id}   {code, csrf_token}
     → {"state":"set_password"}                        ─▶ straight to the password screen
     → {"state":"second_factor_required","methods":["sms"]}  ─▶ MFA first
```

**Recovery never bypasses MFA.** The second-factor endpoints mirror login:

```
POST /self-service/recovery/totp?flow={id}      {code, csrf_token}  → {"state":"set_password"}
POST /self-service/recovery/sms/send?flow={id}  {csrf_token}        → {"state":"sent"}
POST /self-service/recovery/sms?flow={id}       {code, csrf_token}  → {"state":"set_password"}
```

Then:

```
POST /self-service/recovery/password?flow={id}  {password, csrf_token}
     → {"state":"recovered", session:{aal:"aal2"}}
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

These are **session-scoped**, not flows, so they authenticate with the
`pratu_session` cookie and need the session CSRF token from `whoami` in an
`X-CSRF-Token` header. Without it they answer `403`. The enrolment itself still
returns a flow with its own `csrf_token`, which the confirm step sends in the
body — both tokens are required there.

```
POST   /self-service/mfa/totp/enroll                   → {flow_id, secret, uri, csrf_token}
POST   /self-service/mfa/totp/confirm?flow={id} {code, csrf_token}
                                                       → {state:"enrolled", session:{aal:"aal2"}}
DELETE /self-service/mfa/totp                           (requires aal2)

POST   /self-service/mfa/sms/enroll   {phone}           → {flow_id, address:"********5678", csrf_token}
POST   /self-service/mfa/sms/confirm?flow={id}  {code, csrf_token}
                                                       → {state:"enrolled", session:{aal:"aal2"}}
DELETE /self-service/mfa/sms                            (requires aal2)
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

Note that v0.4.0 has **no endpoint to list enrolled factors**. A settings screen
can only discover them from a `409` on re-enrolment, or from `methods` on a held
login.

---

## Re-reading a flow

```
GET /self-service/flows/{id} → Flow
```

What a screen renders after landing on `?flow=`: the step the flow waits on
(`state`), the fields to show, the second-factor methods, the `csrf_token`, and
the messages from the last submission. Readable only by the browser whose CSRF
cookie created the flow.

Verification flow, mid-journey:

```json
{ "id": "9afb6376-…", "kind": "verification", "state": "code_required",
  "csrf_token": "nxwHG6AbQg59L_1l_…",
  "ui": { "fields": [ { "name": "code", "type": "text", "title": "Code", "required": true } ] } }
```

Flow states: `choose_method`, `code_required`, `mfa_required`,
`second_factor_required`, `password_required`.

## Session

```
GET  /sessions/whoami   → {session, identity, csrf_token}
POST /self-service/logout   (X-CSRF-Token)
```

`whoami` is the only way to read the session, since `pratu_session` is HttpOnly,
and it is where the session-scope CSRF token comes from.

---

## 7. Passwordless first factor

Added in v0.4.0 ([ADR 0007](https://github.com/katipwork/pratu/blob/main/docs/adr/0007-passwordless-first-factor.md)).
Opt in per tenant:

```json
PATCH /admin/tenants/{slug}   { "first_factor": ["code"] }
```

`["password"]` (the default), `["code"]`, or `["password","code"]`. The flow
then advertises what it takes, and the UI follows:

| `first_factor` | login `ui.fields` | login `ui.methods` | registration `ui.fields` |
|---|---|---|---|
| `["password"]` | identifier, password | `["password"]` | traits, password |
| `["code"]` | identifier | `["code"]` | traits |
| `["password","code"]` | identifier, password | `["password","code"]` | traits, password |

### Registration

```jsonc
// POST /self-service/registration?flow=…
{ "method": "code",
  "traits": { "phone": "+66812804275" },
  "csrf_token": "…" }          // no password — sending one is rejected
```

The identifier trait must itself be a verification-annotated Address. The
session is withheld until that Address is proven **even under
`verification: deferred`** — an unproven address would leave no credential at
all.

### Login

```
POST /self-service/login/code/send?flow={id}  {identifier, csrf_token}
     → {"state":"code_sent","message":"if the identifier exists, a code was sent to it"}

POST /self-service/login/code?flow={id}       {code, csrf_token}
     → {"state":"active", session:{aal:"aal1"}}
```

The send endpoint doubles as resend, and its answer is uniform — for an unknown
identifier **and** when a delivery cap refused the send, so it is no
enumeration oracle. Observed live: a send inside the 60-second per-address
cooldown still answers `code_sent`, and no message is delivered.

After the send the login flow moves to `state: "code_required"` and `ui.fields`
becomes `[code]`, which is what lets one screen render both steps.

Proving the code marks the Address verified, so a code login never detours into
a Verification step. A code login is `aal1` — one factor is one factor — so an
enrolled second factor is still owed on top, and the `403 mfa_required` branch
works exactly as it does after a password.

Courier template: `login_code` (distinct from `verification_code` and
`mfa_code`).
