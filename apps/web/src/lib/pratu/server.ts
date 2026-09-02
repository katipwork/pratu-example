import "server-only";

import { cookies, headers } from "next/headers";

import type { Flow, WhoAmI } from "./types";

/**
 * Server-side reads against Pratu.
 *
 * Screens are rendered on the server, so they fetch the flow themselves and
 * forward the browser's cookies — a flow is readable only by the browser whose
 * `pratu_csrf` cookie created it, and `whoami` needs `pratu_session`.
 *
 * Writes are not here. Flow submissions are plain HTML form posts straight to
 * Pratu, so the browser follows the 303 itself; only session-scoped actions
 * (logout, MFA) go through a server action, because they need an
 * `X-CSRF-Token` header that a form cannot set.
 */

/** The port Pratu's public API listens on, behind the proxy. */
const INTERNAL_PORT = process.env.PRATU_INTERNAL_PORT ?? "4433";

/**
 * Where the app server reaches Pratu, for the tenant this request belongs to.
 *
 * Pratu picks the tenant from the Host header and Node's fetch silently drops
 * a manually set one, so the tenant hostname has to really be in the URL. It
 * is taken from the incoming request rather than configured, because one
 * deployment serves several tenants — `acme.pratu.localhost` and
 * `otp.pratu.localhost` here — and reading a flow against the wrong tenant
 * simply would not find it.
 *
 * In Docker, network aliases on the pratu service make these resolve.
 */
async function internalOrigin(): Promise<string> {
  const host = (await headers()).get("host") ?? "";
  // Strip the browser-facing port; the internal listener uses its own.
  const hostname = host.replace(/:\d+$/, "");
  return `http://${hostname}:${INTERNAL_PORT}`;
}

/** Passes the browser's Pratu cookies through to the API. */
async function forwardedCookies(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .filter((cookie) => cookie.name.startsWith("pratu_"))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

/**
 * Whether the browser is keeping Pratu's cookies at all.
 *
 * Screens use this to tell two failures apart when a flow will not load. A
 * flow that expired can simply be replaced with a fresh one; a browser that
 * stores no cookies never will, and redirecting it to flow creation again
 * loops forever — the flow is bound to the CSRF cookie it never kept.
 */
export async function hasPratuCookies(): Promise<boolean> {
  return (await forwardedCookies()) !== "";
}

async function get<T>(path: string): Promise<T | null> {
  const cookie = await forwardedCookies();
  if (!cookie) return null;

  try {
    const response = await fetch(`${await internalOrigin()}${path}`, {
      headers: { Accept: "application/json", Cookie: cookie },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Reads the flow a screen landed on: the step it waits on, the fields to
 * render, the second-factor methods, the CSRF token its forms must carry, and
 * the messages the last submission left behind.
 */
export const readFlow = (id: string) => get<Flow>(`/self-service/flows/${id}`);

/** The current session, or null when signed out. */
export const whoami = () => get<WhoAmI>("/sessions/whoami");

/**
 * Calls a session-scoped endpoint on the user's behalf.
 *
 * These reject a cookie session without the session-scope CSRF token in an
 * `X-CSRF-Token` header, which HTML forms cannot set — hence a server action
 * doing it here.
 */
export async function sessionCall(
  path: string,
  init: { method: "POST" | "DELETE"; body?: unknown } = { method: "POST" },
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const cookie = await forwardedCookies();
  const session = await whoami();
  if (!session?.csrf_token) return { ok: false, status: 401, data: null };

  const headers: Record<string, string> = {
    Accept: "application/json",
    Cookie: cookie,
    "X-CSRF-Token": session.csrf_token,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${await internalOrigin()}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Empty body.
  }
  return { ok: response.ok, status: response.status, data };
}

/** Flattens Pratu's `{error: {message, details}}` envelope. */
export function errorText(data: unknown, status: number): string {
  const error = (data as { error?: { message?: string; details?: string[] } })
    ?.error;
  if (!error?.message) return `Request failed (${status})`;
  return error.details?.length
    ? `${error.message}: ${error.details.join("; ")}`
    : error.message;
}
