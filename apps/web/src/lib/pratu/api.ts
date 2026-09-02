import { api } from "./client";
import type {
  AuthResult,
  Flow,
  FlowKind,
  RecoveryCodeResult,
  SentResult,
  SmsEnrollment,
  TotpEnrollment,
  WhoAmI,
} from "./types";

/**
 * Typed wrappers over Pratu's browser-flow API (v0.3.1).
 *
 * Flow submissions carry the flow's `csrf_token` in the body. Session-scoped
 * calls carry the session CSRF token in an `X-CSRF-Token` header instead.
 */

const csrfHeader = (token: string) => ({ "X-CSRF-Token": token });

// ---------------------------------------------------------------------------
// Flow lifecycle
// ---------------------------------------------------------------------------

/**
 * Creates a browser flow. This sets the CSRF cookie, so it must run in the
 * browser — a server-side fetch would capture the cookie on the server.
 */
export const createFlow = (kind: FlowKind, schema?: string) =>
  api<Flow>(
    "GET",
    `/self-service/${kind}/browser${schema ? `?schema=${encodeURIComponent(schema)}` : ""}`,
  );

/**
 * Re-reads a flow the browser already owns: the step it waits on, the fields
 * to render, the second factors available, and messages from the last
 * submission. Readable only by the browser whose CSRF cookie created it.
 */
export const readFlow = (id: string) =>
  api<Flow>("GET", `/self-service/flows/${id}`);

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const submitRegistration = (
  flow: string,
  csrf: string,
  traits: Record<string, unknown>,
  password: string,
) =>
  api<AuthResult>("POST", `/self-service/registration?flow=${flow}`, {
    method: "password",
    traits,
    password,
    csrf_token: csrf,
  });

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Submits a password login. A 403 is part of the happy path: it carries
 * `state: "verification_required"` or `state: "mfa_required"`.
 */
export const submitLogin = (
  flow: string,
  csrf: string,
  identifier: string,
  password: string,
) =>
  api<AuthResult>("POST", `/self-service/login?flow=${flow}`, {
    method: "password",
    identifier,
    password,
    csrf_token: csrf,
  });

export const submitLoginTotp = (flow: string, csrf: string, code: string) =>
  api<AuthResult>("POST", `/self-service/login/totp?flow=${flow}`, {
    code,
    csrf_token: csrf,
  });

/** Mobile OTP step 1 — text a code to the enrolled second-factor phone. */
export const sendLoginSms = (flow: string, csrf: string) =>
  api<SentResult>("POST", `/self-service/login/sms/send?flow=${flow}`, {
    csrf_token: csrf,
  });

/** Mobile OTP step 2 — prove the code; the session becomes aal2. */
export const submitLoginSms = (flow: string, csrf: string, code: string) =>
  api<AuthResult>("POST", `/self-service/login/sms?flow=${flow}`, {
    code,
    csrf_token: csrf,
  });

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export const submitVerification = (flow: string, csrf: string, code: string) =>
  api<AuthResult>("POST", `/self-service/verification?flow=${flow}`, {
    code,
    csrf_token: csrf,
  });

export const resendVerification = (flow: string, csrf: string) =>
  api<SentResult>("POST", `/self-service/verification/resend?flow=${flow}`, {
    csrf_token: csrf,
  });

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

export const submitRecoveryAddress = (
  flow: string,
  csrf: string,
  address: string,
) =>
  api<{ state: "code_sent"; message?: string }>(
    "POST",
    `/self-service/recovery?flow=${flow}`,
    { address, csrf_token: csrf },
  );

export const submitRecoveryCode = (flow: string, csrf: string, code: string) =>
  api<RecoveryCodeResult>("POST", `/self-service/recovery/code?flow=${flow}`, {
    code,
    csrf_token: csrf,
  });

export const submitRecoveryTotp = (flow: string, csrf: string, code: string) =>
  api<{ state: "set_password" }>(
    "POST",
    `/self-service/recovery/totp?flow=${flow}`,
    { code, csrf_token: csrf },
  );

export const sendRecoverySms = (flow: string, csrf: string) =>
  api<SentResult>("POST", `/self-service/recovery/sms/send?flow=${flow}`, {
    csrf_token: csrf,
  });

export const submitRecoverySms = (flow: string, csrf: string, code: string) =>
  api<{ state: "set_password" }>(
    "POST",
    `/self-service/recovery/sms?flow=${flow}`,
    { code, csrf_token: csrf },
  );

export const submitRecoveryPassword = (
  flow: string,
  csrf: string,
  password: string,
) =>
  api<AuthResult>("POST", `/self-service/recovery/password?flow=${flow}`, {
    password,
    csrf_token: csrf,
  });

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Also the source of the session-scope CSRF token. */
export const whoami = () => api<WhoAmI>("GET", "/sessions/whoami");

export const logout = (sessionCsrf: string) =>
  api("POST", "/self-service/logout", undefined, csrfHeader(sessionCsrf));

// ---------------------------------------------------------------------------
// MFA management (session-scoped, so header CSRF)
// ---------------------------------------------------------------------------

export const enrollTotp = (sessionCsrf: string) =>
  api<TotpEnrollment>(
    "POST",
    "/self-service/mfa/totp/enroll",
    undefined,
    csrfHeader(sessionCsrf),
  );

export const confirmTotp = (
  flow: string,
  code: string,
  flowCsrf: string,
  sessionCsrf: string,
) =>
  api<{ state: "enrolled" }>(
    "POST",
    `/self-service/mfa/totp/confirm?flow=${flow}`,
    { code, csrf_token: flowCsrf },
    csrfHeader(sessionCsrf),
  );

export const unenrollTotp = (sessionCsrf: string) =>
  api("DELETE", "/self-service/mfa/totp", undefined, csrfHeader(sessionCsrf));

export const enrollSms = (phone: string, sessionCsrf: string) =>
  api<SmsEnrollment>(
    "POST",
    "/self-service/mfa/sms/enroll",
    { phone },
    csrfHeader(sessionCsrf),
  );

export const confirmSms = (
  flow: string,
  code: string,
  flowCsrf: string,
  sessionCsrf: string,
) =>
  api<{ state: "enrolled" }>(
    "POST",
    `/self-service/mfa/sms/confirm?flow=${flow}`,
    { code, csrf_token: flowCsrf },
    csrfHeader(sessionCsrf),
  );

export const unenrollSms = (sessionCsrf: string) =>
  api("DELETE", "/self-service/mfa/sms", undefined, csrfHeader(sessionCsrf));
