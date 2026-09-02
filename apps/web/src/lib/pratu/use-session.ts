"use client";

import { useCallback, useEffect, useState } from "react";

import { whoami } from "./api";
import type { WhoAmI } from "./types";

/**
 * The current session, read from `GET /sessions/whoami`.
 *
 * With browser flows there is no token to store: the `pratu_session` cookie is
 * HttpOnly, so the only way to know who is signed in is to ask. The response
 * also carries the **session-scope CSRF token**, which every state-changing
 * call against the session (logout, MFA management) must echo in an
 * `X-CSRF-Token` header.
 */
export function useSession() {
  const [session, setSession] = useState<WhoAmI | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumping this re-runs the effect; the fetch itself stays inside it.
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await whoami();
      if (cancelled) return;
      setSession(result.ok ? result.data : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { session, loading, reload };
}
