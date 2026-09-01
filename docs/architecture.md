# Architecture

How this example talks to [Pratu](https://github.com/katipwork/pratu) v0.3.1,
and why it is wired the way it is.

## The tenant is the hostname

Pratu is multi-tenant, and the tenant is selected by the **Host header**:
`{slug}.{base_domain}`. Every tenant is its own OIDC issuer. There is no
`?tenant=` parameter and no tenant field in any request body.

This has a consequence that shapes the whole integration:

> **Node's `fetch` silently ignores a manually set `Host` header.**

Setting `headers: { Host: "acme.pratu.localhost" }` in undici does nothing — the
header is dropped and the socket's real authority is sent instead. Verified:

```js
await fetch("http://127.0.0.1:PORT/", { headers: { Host: "acme.pratu.localhost" } });
// server sees: host: 127.0.0.1:PORT
```

So the tenant hostname must be the URL we actually call. That is why the config
is a single origin, not a base URL plus a slug:

```bash
PRATU_TENANT_URL=http://acme.pratu.localhost:4433
```

`*.localhost` resolves to loopback with no DNS setup, which makes local
development work out of the box. Note it resolves to **`::1`** (IPv6), so the
Pratu server has to be listening dual-stack — Go's default `":4433"` is.

If you must route through an internal load balancer with a Host override, plain
`fetch` cannot do it; drop to `node:http` or an undici dispatcher.

## Two integration modes, and why this example picks one

Pratu offers each self-service flow in two variants.

| | Browser flow (`/browser`) | API flow (`/api`) |
|---|---|---|
| Auth carrier | `pratu_session` cookie | opaque `session_token` |
| CSRF | required, bound to the flow | none |
| Origin constraint | **must be same-origin as the tenant** | none |
| Who calls it | the browser | your server |

Pratu sets `HttpOnly, SameSite=Lax` cookies scoped to the tenant hostname and
**supports no CORS**. A Next.js app on `localhost:3000` therefore cannot use
browser flows — the cookies are not readable and the requests would be blocked.
Making them work requires a reverse proxy that puts your UI and Pratu on the
same hostname while preserving the Host header:

```caddy
acme.pratu.localhost:8080 {
    reverse_proxy /self-service/* /sessions/* /oauth2/* /.well-known/* localhost:4433
    reverse_proxy localhost:3000
}
```

**This example uses API flows instead**, called from Next.js server components
and server actions. No proxy, no CORS, and credentials never reach the browser.
The trade-off is that we take responsibility for storing the session token.

## Session handling

Pratu hands back an opaque `session_token` (`pst_…`). We keep it in our own
HttpOnly cookie and exchange it for user data on each request:

```
browser  ──form POST──▶  server action  ──X-Session-Token──▶  Pratu
   ▲                          │
   └──── Set-Cookie ──────────┘   (our cookie, not Pratu's)
```

Sessions are server-side and revocable — never JWTs. `GET /sessions/whoami`
is the source of truth; a deleted or expired session fails closed and
`currentUser()` returns `null`.

`aal1` vs `aal2` records whether a second factor was proven in *this* session.

## Carrying multi-step flows

API flows are not bound to a browser cookie, so the flow id has to be carried
between screens. This example keeps it in a short-lived HttpOnly cookie
(`pratu_example_flow`, 15 min) rather than the URL, where it would leak through
browser history, `Referer` headers, and server logs.

```
/register ─┬─ state: verification_required ─▶ cookie{flow, kind:"verification"} ─▶ /verify
/login ────┼─ 403 mfa_required ─────────────▶ cookie{flow, kind:"login-mfa"} ────▶ /login/mfa
/recovery ─┴─ code_sent ────────────────────▶ cookie{flow, kind:"recovery"} ─────▶ /recovery/code
```

Each screen validates the cookie's `kind` and redirects away if it does not
match, so a stale cookie cannot strand a user on a dead screen.

## Code layout

```
src/lib/pratu/
├── config.ts    tenant origin + cookie names
├── types.ts     wire types mirroring api/public.openapi.yaml
├── client.ts    fetch wrapper, error normalisation
├── api.ts       one function per endpoint
└── session.ts   our session cookie + pending-flow cookie

src/app/
├── actions.ts   server actions: the state machine of every flow
├── register/    login/  login/mfa/  verify/
├── recovery/    recovery/code|mfa|password/
├── mfa/         dashboard/
└── ...
```

`client.ts` exposes two entry points. `request()` throws `PratuError` on any
non-2xx. `requestRaw()` returns the status and parsed body without throwing —
needed because **a 403 is part of the happy path** for login (see
[flows.md](flows.md)).

## Error contract

Pratu answers errors as `{"error": {"message": string, "details": [string]}}`,
which `PratuError` flattens into `message` + `details[]`. Rate limits answer
`429` with `Retry-After`.

`PratuError` also keeps the raw `payload`, which is what lets `submitLogin()`
distinguish "wrong password" from "correct password, now prove your phone".

## Gotchas found while building this

- **`"use server"` modules may only export async functions.** A shared
  `emptyState` object in `actions.ts` breaks the build with
  *"A 'use server' file can only export async functions, found object"*. It
  lives in `src/lib/form-state.ts` instead.
- **`ui.fields` includes `password`.** The registration flow lists the password
  next to the schema traits, but it is a credential submitted as its own
  top-level field — it must be filtered out of `traits`, or the server rejects
  the payload for an unknown trait.
- **Trait fields report JSON types.** An email trait is `type: "string"`, not
  `"email"`, so the HTML input type comes from the trait's role, not its type.
- **No "list my enrolled factors" endpoint** exists in v0.3.1. `whoami` returns
  the session and identity only. You learn what is enrolled from `methods` on a
  held login, or from a `409` when enrolling again.
- **Returning JSX from inside `try`/`catch` is unsafe** in React — render errors
  escape the handler. Flow creation uses `attempt()` so the try/catch closes
  before any JSX exists.

## Running it in Docker

The same Host-header constraint shapes `docker-compose.yml`. Service names do
not help — calling `http://pratu:4433` would send `Host: pratu` and resolve no
tenant. The `pratu` service therefore carries a **network alias of the tenant
hostname**, so `acme.pratu.localhost` resolves inside the compose network and
the URL and the Host agree:

```yaml
networks:
  default:
    aliases:
      - acme.pratu.localhost
```

Two more things that bite:

- **Postgres must not run as the app role.** Pratu refuses to start when its
  connection has `SUPERUSER` or `BYPASSRLS`, because that makes every
  row-level-security policy silently inert. `POSTGRES_USER=pratu` produces
  exactly that, so the superuser stays `postgres` and
  `docker/devdb/01-app-role.sql` creates an unprivileged `pratu` role — the
  same bootstrap upstream uses.
- **A `.dockerignore` is mandatory, not tidiness.** `COPY . .` would drag the
  host's `node_modules` over the ones installed in the image, and pnpm aborts
  with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` rather than silently
  continuing.

Pratu is built straight from the pinned tag
(`context: https://github.com/katipwork/pratu.git#v0.3.1`), so the compose file
cannot drift from the version this UI was written against.
