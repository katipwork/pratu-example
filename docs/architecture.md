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

**This example uses browser flows exclusively.** That is the mode Pratu is
designed around: the session is an HttpOnly cookie the page can never read, so
a stolen script cannot exfiltrate it, and the server keeps full control of
session lifetime and revocation.

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

### Why not call Pratu from the Next.js server instead?

Two reasons.

1. Flow creation (`GET /self-service/{kind}/browser`) responds with
   `Set-Cookie`. A server-side fetch captures that cookie **on the server**,
   where it is useless — the browser never receives it. Browser flows have to
   be driven by the browser.
2. Node's `fetch` (undici) **silently drops a manually set `Host` header**, so
   server-side code cannot even address a tenant without a custom dispatcher:

   ```js
   await fetch("http://127.0.0.1:4433/", { headers: { Host: "acme.pratu.localhost" } });
   // server sees: host: 127.0.0.1:4433
   ```

The upshot is that the Next.js app never talks to Pratu at all. Every route in
this app builds as static (`○`); the app server only serves the shell.

## Two CSRF scopes

Browser flows are CSRF-protected, and the token you need depends on what you
are calling.

| Scope | Where it comes from | How it is sent | Used by |
|---|---|---|---|
| **Flow** | `csrf_token` on the flow | `csrf_token` in the request **body** | every flow submission |
| **Session** | `csrf_token` from `whoami` | `X-CSRF-Token` **header** | logout, MFA management, OAuth2 accept |

Both are enforced. Verified against a live server: a registration submission
without the flow token answers `403`, and `POST /self-service/mfa/totp/enroll`
without the header answers `403`.

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

## Carrying a flow across screens

A flow id lives in the URL as `?flow={id}`, which is also how Pratu itself
redirects. That is safe here: a browser flow is bound to the CSRF cookie of the
browser that created it, so the id alone grants nothing.

`useFlow(kind)` implements the two ways a screen can start:

- **`?flow=` present** — re-read it with `GET /self-service/flows/{id}`, which
  returns the step the flow waits on (`state`), the fields to render, the
  second-factor methods available, and messages from the last submission. This
  is what makes redirect landings work.
- **no query** — create a flow with `GET /self-service/{kind}/browser`, then
  write the id into the URL so a reload resumes instead of restarting.

Because the flow reports its own state, some screens are one component with
several steps. `/recovery` renders the address, code, second-factor, or
new-password step depending on `flow.state`, and `/login` renders the second
factor in place — the held login is still the same flow, with the same id and
the same CSRF token.

## Code layout

```
src/lib/pratu/
├── types.ts        wire types mirroring api/public.openapi.yaml
├── client.ts       same-origin fetch, JSON negotiation, error flattening
├── api.ts          one function per endpoint
├── use-flow.ts     create-or-read a flow; where to go after auth
└── use-session.ts  whoami + the session CSRF token

src/components/
├── ui.tsx            card, fields, button, notices
└── second-factor.tsx TOTP/SMS step, shared by login and recovery

src/app/
├── login/  register/  verify/  recovery/  mfa/  dashboard/
```

`client.ts` always sends `Accept: application/json`. Browser flows are
content-negotiated: a client that prefers `text/html` is driven by 303
redirects to the tenant's configured screens instead of receiving JSON.

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
- **`useSearchParams` needs a Suspense boundary**, so each screen that reads
  `?flow=` is wrapped in one.

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
