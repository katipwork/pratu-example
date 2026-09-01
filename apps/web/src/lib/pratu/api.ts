import "server-only";

import { request, requestRaw } from "./client";
import type {
  AuthResult,
  Flow,
  HeldLogin,
  RecoveryCodeResult,
  SentResult,
  SmsEnrollment,
  TotpEnrollment,
  WhoAmI,
} from "./types";

/**
 * Thin, typed wrappers over the Pratu public API (v0.3.1).
 *
 * Everything here uses **API flows** (`/api` creation endpoints): the server
 * returns an opaque `session_token` and no CSRF is involved. The alternative —
 * browser flows — requires the UI to be served from the tenant hostname behind
 * a reverse proxy, since Pratu sets host-scoped cookies and supports no CORS.
 */

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Creates a registration flow. `schema` picks a named Identity Schema. */
export function createRegistrationFlow(schema?: string): Promise<Flow> {
  return request<Flow>("/self-service/registration/api", {
    method: "POST",
    query: { schema },
  });
}

/**
 * Submits registration. Under the default `required` verification policy the
 * session is withheld and the result carries `state: "verification_required"`
 * plus the spawned verification flow.
 */
export function submitRegistration(
  flow: string,
  traits: Record<string, unknown>,
  password: string,
): Promise<AuthResult> {
  return request<AuthResult>("/self-service/registration", {
    method: "POST",
    query: { flow },
    body: { method: "password", traits, password },
  });
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export function createLoginFlow(): Promise<Flow> {
  return request<Flow>("/self-service/login/api", { method: "POST" });
}

/**
 * Submits a password login.
 *
 * A 403 is not a failure here: it means the login is *held* pending another
 * step — address verification, or a second factor. The caller inspects
 * `held.state` to decide which screen comes next.
 */
export async function submitLogin(
  flow: string,
  identifier: string,
  password: string,
): Promise<
  { kind: "success"; result: AuthResult } | { kind: "held"; held: HeldLogin }
> {
  const response = await requestRaw<AuthResult | HeldLogin>(
    "/self-service/login",
    {
      method: "POST",
      query: { flow },
      body: { method: "password", identifier, password },
    },
  );

  if (response.ok) {
    return { kind: "success", result: response.data as AuthResult };
  }
  if (response.status === 403) {
    return { kind: "held", held: response.data as HeldLogin };
  }
  const { toError } = await import("./client");
  throw toError(response.status, response.data);
}

/** Completes a held login with a TOTP code; yields an aal2 session. */
export function submitLoginTotp(
  flow: string,
  code: string,
): Promise<AuthResult> {
  return request<AuthResult>("/self-service/login/totp", {
    method: "POST",
    query: { flow },
    body: { code },
  });
}

/** Sends a one-time code to the identity's enrolled second-factor phone. */
export function sendLoginSms(flow: string): Promise<SentResult> {
  return request<SentResult>("/self-service/login/sms/send", {
    method: "POST",
    query: { flow },
    body: {},
  });
}

/** Completes a held login with the SMS code; yields an aal2 session. */
export function submitLoginSms(
  flow: string,
  code: string,
): Promise<AuthResult> {
  return request<AuthResult>("/self-service/login/sms", {
    method: "POST",
    query: { flow },
    body: { code },
  });
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Proves an address with its one-time code. Five wrong attempts invalidate the
 * code. When the flow was spawned by a session-withholding registration or
 * login, success issues the session.
 */
export function submitVerification(
  flow: string,
  code: string,
): Promise<AuthResult> {
  return request<AuthResult>("/self-service/verification", {
    method: "POST",
    query: { flow },
    body: { code },
  });
}

export function resendVerification(flow: string): Promise<SentResult> {
  return request<SentResult>("/self-service/verification/resend", {
    method: "POST",
    query: { flow },
    body: {},
  });
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

export function createRecoveryFlow(): Promise<Flow> {
  return request<Flow>("/self-service/recovery/api", { method: "POST" });
}

/**
 * Submits the recovery address. Anti-enumeration by design: the response is
 * identical whether or not the address exists, so the UI must never imply that
 * an account was found.
 */
export function submitRecoveryAddress(
  flow: string,
  address: string,
): Promise<{ state: "code_sent"; message?: string }> {
  return request("/self-service/recovery", {
    method: "POST",
    query: { flow },
    body: { address },
  });
}

/**
 * Proves the recovery code. Recovery never bypasses MFA, so the next step is
 * either `set_password` or `second_factor_required`.
 */
export function submitRecoveryCode(
  flow: string,
  code: string,
): Promise<RecoveryCodeResult> {
  return request<RecoveryCodeResult>("/self-service/recovery/code", {
    method: "POST",
    query: { flow },
    body: { code },
  });
}

export function submitRecoveryTotp(
  flow: string,
  code: string,
): Promise<{ state: "set_password" }> {
  return request("/self-service/recovery/totp", {
    method: "POST",
    query: { flow },
    body: { code },
  });
}

export function sendRecoverySms(flow: string): Promise<SentResult> {
  return request<SentResult>("/self-service/recovery/sms/send", {
    method: "POST",
    query: { flow },
    body: {},
  });
}

export function submitRecoverySms(
  flow: string,
  code: string,
): Promise<{ state: "set_password" }> {
  return request("/self-service/recovery/sms", {
    method: "POST",
    query: { flow },
    body: { code },
  });
}

/**
 * Sets the new password and completes recovery. The server replaces the
 * password credential, marks the recovery address verified, revokes every
 * other session, and issues a fresh one.
 */
export function submitRecoveryPassword(
  flow: string,
  password: string,
): Promise<AuthResult> {
  return request<AuthResult>("/self-service/recovery/password", {
    method: "POST",
    query: { flow },
    body: { password },
  });
}

// ---------------------------------------------------------------------------
// MFA management (requires a session)
// ---------------------------------------------------------------------------

/** Starts TOTP enrolment; the secret stays pending until a code proves it. */
export function enrollTotp(sessionToken: string): Promise<TotpEnrollment> {
  return request<TotpEnrollment>("/self-service/mfa/totp/enroll", {
    method: "POST",
    sessionToken,
  });
}

/** Activates the pending TOTP enrolment and raises the session to aal2. */
export function confirmTotp(
  sessionToken: string,
  flow: string,
  code: string,
): Promise<{ state: "enrolled" }> {
  return request("/self-service/mfa/totp/confirm", {
    method: "POST",
    query: { flow },
    body: { code },
    sessionToken,
  });
}

/** Removes the TOTP factor. Requires an aal2 session. */
export function unenrollTotp(sessionToken: string): Promise<unknown> {
  return request("/self-service/mfa/totp", { method: "DELETE", sessionToken });
}

/** Starts SMS second-factor enrolment; `phone` is international format. */
export function enrollSms(
  sessionToken: string,
  phone: string,
): Promise<SmsEnrollment> {
  return request<SmsEnrollment>("/self-service/mfa/sms/enroll", {
    method: "POST",
    body: { phone },
    sessionToken,
  });
}

/** Activates the pending SMS enrolment and raises the session to aal2. */
export function confirmSms(
  sessionToken: string,
  flow: string,
  code: string,
): Promise<{ state: "enrolled" }> {
  return request("/self-service/mfa/sms/confirm", {
    method: "POST",
    query: { flow },
    body: { code },
    sessionToken,
  });
}

/** Removes the SMS factor. Requires an aal2 session. */
export function unenrollSms(sessionToken: string): Promise<unknown> {
  return request("/self-service/mfa/sms", { method: "DELETE", sessionToken });
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export function whoami(sessionToken: string): Promise<WhoAmI> {
  return request<WhoAmI>("/sessions/whoami", { sessionToken });
}

export function logout(sessionToken: string): Promise<unknown> {
  return request("/self-service/logout", { method: "POST", sessionToken });
}
