"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createFlow, readFlow } from "./api";
import { errorText } from "./client";
import type { Flow, FlowKind } from "./types";

/**
 * Obtains the flow a screen renders.
 *
 * Two ways in, both normal:
 *  - `?flow={id}` in the URL — the screen was landed on, either by our own
 *    navigation or by a 303 from Pratu. The flow is re-read so the screen sees
 *    the step it waits on and any messages from the last submission.
 *  - no query — create a fresh flow. The id is then written into the URL so a
 *    reload resumes rather than restarting.
 *
 * The flow id is safe in the URL here: a browser flow is bound to the CSRF
 * cookie of the browser that created it, so the id alone grants nothing.
 */
export function useFlow(kind: FlowKind) {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("flow");

  const [flow, setFlow] = useState<Flow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = id ? await readFlow(id) : await createFlow(kind);
      if (cancelled) return;

      if (!result.ok) {
        // A stale or foreign id should not strand the screen; start over.
        if (id) {
          router.replace(window.location.pathname);
          return;
        }
        setError(errorText(result));
        return;
      }

      setFlow(result.data);
      if (!id) {
        const url = `${window.location.pathname}?flow=${result.data.id}`;
        router.replace(url);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, kind, router]);

  return { flow, setFlow, error };
}

/**
 * Sends the browser on once a flow has produced a session.
 *
 * Browser flows return no token — the `pratu_session` cookie is already set by
 * the time this runs, so the destination simply reads `whoami`.
 */
export function useAfterAuth() {
  const router = useRouter();
  return useCallback(
    (state?: string) => {
      // A tenant with `mfa: required` asks for enrolment before anything else.
      router.push(state === "mfa_enrollment_required" ? "/mfa" : "/dashboard");
    },
    [router],
  );
}
