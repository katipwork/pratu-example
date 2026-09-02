# Architecture

How this example talks to [Pratu](https://github.com/katipwork/pratu) v0.3.1,
and why it is wired the way it is.

## The tenant is the hostname

Pratu is multi-tenant, and the tenant is selected by the **Host header**:
`{slug}.{base_domain}`. Every tenant is its own OIDC issuer. There is no
`?tenant=` parameter and no tenant field in any request body.

Pratu strips the port before resolving, so `acme.pratu.localhost:8080` and
`acme.pratu.localhost:4433` both resolve the `acme` tenant.

`*.localhost` resolves to loopback with no DNS setup, which makes local
development work out of the box.

## Browser flows, and what they demand

Pratu offers each self-service flow in two variants.

| | Browser flow (`/browser`) | API flow (`/api`) |
|---|---|---|
| Auth carrier | `pratu_session` cookie | opaque `session_token` |
| CSRF | required | none |
| Origin constraint | **must be same-origin as the tenant** | none |
| Who calls it | the browser | your server |

**This example uses browser flows exclusively, in their redirect-driven form.**

That distinction matters, because browser flows are *content-negotiated* and
the two halves feel nothing alike:

| client | what Pratu does |
|---|---|
| asks for `application/json` | answers JSON; the client routes itself |
| prefers `text/html`, **or posts a form** | answers **303** to the tenant's own screens |

A `fetch()` that sets `Accept: application/json` is still a browser flow — it
uses the cookies and the CSRF token — but it never touches the redirect path,
which is the part v0.3.0 was built around (ADR 0006). This app posts plain HTML
forms and follows the redirects, so **nothing here needs JavaScript**: both
end-to-end suites run with scripts disabled.

The session is an HttpOnly cookie the page can never read, so a stolen script
cannot exfiltrate it, and the server keeps control of session lifetime and
revocation.

The price is the origin constraint. Pratu's cookies are `HttpOnly, SameSite=Lax`
and host-scoped to the tenant hostname, and the server **supports no CORS**. So
the app and the auth API must be one origin. A reverse proxy provides it:

```caddy
:8080 {
	@pratu path /self-service/* /sessions/* /oauth2/* /.well-known/* /health/*
	reverse_proxy @pratu pratu:4433
	reverse_proxy web:3000
}
```

Caddy passes the Host header through unchanged, which is what selects the
tenant. The browser then loads the app from
`http://acme.pratu.localhost:8080` and calls `/self-service/...` on that same
origin — relative paths, no base URL, no CORS.

### What runs where

Writes never pass through Next.js. A form posts **straight to Pratu**, which
answers 303 and sends the browser back to the screen — that is the whole point,
and it is why flow creation (`GET /self-service/{kind}/browser`) works: its
`Set-Cookie` reaches the browser because the browser made the request. A
server-side fetch would have captured that cookie on the server, where it is
useless.

Reads do happen on the server. A screen renders its own flow, so it calls
`GET /self-service/flows/{id}` and forwards the browser's cookies. That needs a
URL whose **hostname is the tenant**, because Pratu resolves the tenant from
Host and Node's `fetch` silently drops a manually set one:

```js
await fetch("http://127.0.0.1:4433/", { headers: { Host: "acme.pratu.localhost" } });
// server sees: host: 127.0.0.1:4433
```

So `PRATU_INTERNAL_URL` is `http://acme.pratu.localhost:4433`, resolved inside
Docker by a network alias on the pratu service.

Every route renders on demand (`ƒ`); nothing is prerendered, and no client
component ships.

## Two CSRF scopes — and why one needs a server action

Browser flows are CSRF-protected, and the token you need depends on what you
are calling.

| Scope | Where it comes from | How it is sent | Used by |
|---|---|---|---|
| **Flow** | `csrf_token` on the flow | `csrf_token` in the request **body** | every flow submission |
| **Session** | `csrf_token` from `whoami` | `X-CSRF-Token` **header** | logout, MFA management, OAuth2 accept |

Both are enforced. Verified against a live server: a registration submission
without the flow token answers `403`, and `POST /self-service/mfa/totp/enroll`
without the header answers `403`.

The flow token is a hidden input, so plain forms cover every flow submission.
The session token cannot be — **an HTML form can send a body but not a
header**. Those calls therefore go through a Next.js server action
(`src/app/actions.ts`), which sets the header on the browser's behalf. Server
actions are progressively enhanced, so this still works with scripts off; the
suites prove it by signing out and enrolling a factor with JavaScript
disabled.

Pratu sets a `pratu_csrf` cookie when a browser flow is created; the token in
the response is bound to it, so neither half alone is enough.

## Sessions

There is nothing to store. `pratu_session` is HttpOnly, so the page cannot read
it — the only way to know who is signed in is to ask:

```
GET /sessions/whoami → { session, identity, csrf_token }
```

`useSession()` wraps that. Sessions are server-side and revocable, never JWTs.
`aal1` vs `aal2` records whether a second factor was proven in this session.

## The redirect loop

Every screen works the same way, and the server drives all of it:

```
GET /login                 (no ?flow=)
  └─ 307 ─▶ GET /self-service/login/browser
              └─ Pratu creates a flow, sets pratu_csrf
              └─ 303 ─▶ GET /login?flow=abc
                          └─ screen reads GET /self-service/flows/abc
                          └─ renders fields + csrf_token

POST /self-service/login?flow=abc      (plain form, urlencoded)
  ├─ wrong password  ─▶ 303 back to /login?flow=abc
  │                     with {"type":"error","text":"invalid credentials"}
  │                     persisted on the flow
  ├─ needs a factor  ─▶ 303 back to /login?flow=abc, state now mfa_required
  └─ success         ─▶ 303 to ui.default_return_url  (/dashboard)
```

The flow id is safe in the URL: a browser flow is bound to the CSRF cookie of
the browser that created it, so the id alone grants nothing.

Because the flow reports its own `state`, one screen serves a whole journey.
`/recovery` renders the address, code, second-factor or new-password step from
`flow.state` alone, and `/login` renders the second factor in place. Nothing is
remembered on our side — reload any step and it resumes.

### This only works if the tenant has screens

`redirectToScreen()` gives up when the tenant configured no screen for that
flow kind, and Pratu falls back to answering JSON. So the `ui` block is not
decoration — without it there is no redirect-driven flow at all:

```json
{ "ui": {
    "login_url":          "http://acme.pratu.localhost:8080/login",
    "registration_url":   ".../register",
    "recovery_url":       ".../recovery",
    "verification_url":   ".../verify",
    "error_url":          ".../error",
    "default_return_url": ".../dashboard" } }
```

The `bootstrap` service sets these when it creates the tenant.

Failures with no flow left to return to land on `error_url` with `?code=`:
`flow_expired`, `csrf_violation`, `rate_limited`, `unknown_schema`,
`internal_error`.

## Code layout

```
src/lib/pratu/
├── types.ts     wire types mirroring api/public.openapi.yaml
└── server.ts    server-side reads (cookie-forwarding) + session-scoped calls

src/components/
├── ui.tsx            card, fields, button, messages, FlowForm
└── second-factor.tsx TOTP/SMS step, shared by login and recovery

src/app/
├── actions.ts   server actions: logout and MFA management only
└── login/  register/  verify/  recovery/  mfa/  dashboard/  error/
```

There is no HTTP client for writes and no `"use client"` anywhere. `FlowForm`
is just a `<form method="POST">` with the CSRF token as a hidden input.

## Gotchas found while building this

- **`ui.fields` includes `password`.** The registration flow lists the password
  next to the schema traits, but it is a credential submitted as its own
  top-level field — it must be filtered out of `traits`.
- **Trait fields report JSON types.** An email trait is `type: "string"`, not
  `"email"`, so the HTML input type comes from the trait's role.
- **A 403 on login is the happy path** when it carries `mfa_required` or
  `verification_required`.
- **No "list my enrolled factors" endpoint** exists in v0.3.1. `whoami` returns
  the session and identity only. You learn what is enrolled from `methods` on a
  held login, or from a `409` when enrolling again.
- **Configure the tenant's `ui` block or nothing redirects.** With it empty,
  even a form post gets JSON back and the whole redirect design silently does
  not happen — which is easy to mistake for having implemented it.
- **Form posts nest traits for you**: the field is `traits.email`, not `email`
  as in the JSON body.

## Running it in Docker

`docker-compose.yml` runs Postgres, Pratu, the Next.js app, and Caddy. Caddy
owns the only published web port; the app and Pratu are reachable through it at
one origin.

Two things that bite:

- **Postgres must not run as the app role.** Pratu refuses to start when its
  connection has `SUPERUSER` or `BYPASSRLS`, because that makes every
  row-level-security policy silently inert. `POSTGRES_USER=pratu` produces
  exactly that, so the superuser stays `postgres` and
  `docker/devdb/01-app-role.sql` creates an unprivileged `pratu` role — the
  same bootstrap upstream uses.
- **A `.dockerignore` is mandatory, not tidiness.** `COPY . .` would drag the
  host's `node_modules` over the ones installed in the image, and pnpm aborts
  with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.

Pratu is built straight from the pinned tag
(`context: https://github.com/katipwork/pratu.git#v0.3.1`), so the compose file
cannot drift from the version this UI was written against.
