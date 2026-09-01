import "server-only";

import { PRATU_TENANT_URL } from "./config";

/**
 * A non-2xx response from Pratu.
 *
 * `payload` keeps the parsed body, because some non-2xx responses are part of
 * the happy path: a login held for a second factor answers 403 with
 * `{state: "mfa_required", methods: [...]}`.
 */
export class PratuError extends Error {
  readonly status: number;
  readonly details: string[];
  readonly payload: unknown;
  readonly retryAfter?: string;

  constructor(
    status: number,
    message: string,
    details: string[] = [],
    payload: unknown = undefined,
    retryAfter?: string,
  ) {
    super(message);
    this.name = "PratuError";
    this.status = status;
    this.details = details;
    this.payload = payload;
    this.retryAfter = retryAfter;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  /** JSON body. Omitted entirely when undefined. */
  body?: unknown;
  /** Opaque session token from an API flow; sent as `X-Session-Token`. */
  sessionToken?: string;
  /** Query string parameters; undefined values are dropped. */
  query?: Record<string, string | undefined>;
}

export interface RawResponse<T> {
  ok: boolean;
  status: number;
  data: T;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path, PRATU_TENANT_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Calls Pratu and returns the parsed body with its status, without throwing.
 * Use this when a non-2xx status carries meaning (held logins).
 */
export async function requestRaw<T>(
  path: string,
  options: RequestOptions = {},
): Promise<RawResponse<T>> {
  const { method = "GET", body, sessionToken, query } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // API flows authenticate with the opaque token; they never need CSRF.
  if (sessionToken) headers["X-Session-Token"] = sessionToken;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Never let Next cache an auth call.
      cache: "no-store",
    });
  } catch (cause) {
    throw new PratuError(
      0,
      `Cannot reach the Pratu server at ${PRATU_TENANT_URL}. Is it running?`,
      [cause instanceof Error ? cause.message : String(cause)],
    );
  }

  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: { message: text } };
    }
  }

  return { ok: response.ok, status: response.status, data: data as T };
}

/** Calls Pratu and throws {@link PratuError} on any non-2xx status. */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await requestRaw<T>(path, options);
  if (!response.ok) throw toError(response.status, response.data);
  return response.data;
}

/** Normalises Pratu's `{error: {message, details}}` envelope into an Error. */
export function toError(status: number, payload: unknown): PratuError {
  const envelope = payload as
    | { error?: { message?: string; details?: string[] } }
    | undefined;
  const message =
    envelope?.error?.message ??
    (status === 429
      ? "Too many attempts. Please wait and try again."
      : `Request failed with status ${status}`);
  return new PratuError(
    status,
    message,
    envelope?.error?.details ?? [],
    payload,
  );
}
