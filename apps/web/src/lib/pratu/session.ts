import "server-only";

import { cookies } from "next/headers";

import { FLOW_COOKIE, SESSION_COOKIE } from "./config";
import { whoami } from "./api";
import type { WhoAmI } from "./types";

/**
 * Session storage for the API-flow integration mode.
 *
 * Pratu's own `pratu_session` cookie is host-scoped to the tenant domain, so an
 * app served from a different origin cannot use it. With API flows the server
 * hands us an opaque `session_token` instead and we keep it in our own
 * HttpOnly cookie.
 */

const baseCookie = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
} as const;

export async function setSessionToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...baseCookie, maxAge: 60 * 60 * 24 * 7 });
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function clearSessionToken(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Returns the current session, or null when signed out or the token expired. */
export async function currentUser(): Promise<WhoAmI | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    return await whoami(token);
  } catch {
    return null;
  }
}

/**
 * Pending multi-step flow state.
 *
 * API flows are not bound to a browser cookie, so the flow id has to be carried
 * between screens. A short-lived HttpOnly cookie keeps it out of the URL, where
 * it would leak through history and Referer headers.
 */
export interface PendingFlow {
  id: string;
  kind: "verification" | "login-mfa" | "recovery" | "mfa-enroll";
  /** Second factors offered, for held logins and recovery. */
  methods?: string[];
  /** Masked destination, for display only. */
  address?: string;
}

export async function setPendingFlow(flow: PendingFlow): Promise<void> {
  const store = await cookies();
  store.set(FLOW_COOKIE, JSON.stringify(flow), { ...baseCookie, maxAge: 900 });
}

export async function getPendingFlow(): Promise<PendingFlow | null> {
  const store = await cookies();
  const raw = store.get(FLOW_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingFlow;
  } catch {
    return null;
  }
}

export async function clearPendingFlow(): Promise<void> {
  const store = await cookies();
  store.delete(FLOW_COOKIE);
}
