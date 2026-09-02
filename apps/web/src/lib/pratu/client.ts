/**
 * Browser-flow transport.
 *
 * Every call is same-origin: the app and Pratu are served from one hostname by
 * the reverse proxy, because Pratu's cookies are HttpOnly and host-scoped to
 * the tenant and the server supports no CORS. Paths are therefore relative and
 * there is no base URL to configure.
 *
 * Two kinds of CSRF live here:
 *  - *flow scope* — `csrf_token` from the flow, sent in the request body of
 *    every flow submission.
 *  - *session scope* — the token from `GET /sessions/whoami`, sent as an
 *    `X-CSRF-Token` header on state-changing calls against a session
 *    (logout, MFA management).
 */

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export async function api<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<ApiResult<T>> {
  const init: RequestInit = {
    method,
    // Sends and accepts Pratu's host-scoped cookies.
    credentials: "same-origin",
    // Ask for JSON explicitly: browser flows are content-negotiated and would
    // answer an HTML-preferring client with 303 redirects instead.
    headers: { Accept: "application/json", ...headers },
  };

  if (body !== undefined) {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    return {
      ok: false,
      status: 0,
      data: {
        error: { message: "Cannot reach the server. Check your connection." },
      } as T,
    };
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Some endpoints answer with an empty body.
  }

  return { ok: response.ok, status: response.status, data: data as T };
}

/** Flattens Pratu's `{error: {message, details}}` envelope into one string. */
export function errorText(result: ApiResult<unknown>): string {
  const envelope = result.data as
    | { error?: { message?: string; details?: string[] } }
    | undefined;
  const error = envelope?.error;
  if (!error?.message) {
    return result.status === 429
      ? "Too many attempts. Please wait and try again."
      : `Request failed (${result.status})`;
  }
  return error.details?.length
    ? `${error.message}: ${error.details.join("; ")}`
    : error.message;
}
