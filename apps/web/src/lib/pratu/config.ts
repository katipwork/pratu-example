/**
 * Pratu server configuration.
 *
 * A Pratu tenant is selected by the **Host header** — the tenant origin is
 * `{slug}.{base_domain}`. Node's fetch (undici) silently drops a manually set
 * `Host` header, so the tenant hostname must be the actual URL we call.
 * That is why this is a full origin, not a base URL + slug pair.
 */
export const PRATU_TENANT_URL = (
  process.env.PRATU_TENANT_URL ?? "http://acme.pratu.localhost:4433"
).replace(/\/$/, "");

/** Name of our own cookie holding the Pratu session token. */
export const SESSION_COOKIE = "pratu_example_session";

/** Cookie holding an in-progress flow id (registration/login/recovery). */
export const FLOW_COOKIE = "pratu_example_flow";
