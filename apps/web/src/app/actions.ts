"use server";

import { redirect } from "next/navigation";

import * as pratu from "@/lib/pratu/api";
import { PratuError } from "@/lib/pratu/client";
import {
  clearPendingFlow,
  clearSessionToken,
  getPendingFlow,
  getSessionToken,
  setPendingFlow,
  setSessionToken,
} from "@/lib/pratu/session";
import type { AuthResult } from "@/lib/pratu/types";
import type { FormState, TotpEnrollState } from "@/lib/form-state";

function fail(error: unknown): FormState {
  if (error instanceof PratuError) {
    return { error: error.message, details: error.details };
  }
  return { error: error instanceof Error ? error.message : String(error) };
}

/**
 * Turns a completed flow into a redirect target.
 *
 * `verification_required` means the session is withheld until the spawned
 * verification flow completes — the token, when present, is only stored once
 * the identity is actually signed in.
 */
async function settle(result: AuthResult): Promise<string> {
  if (result.state === "verification_required" && result.verification) {
    await setPendingFlow({
      id: result.verification.flow_id,
      kind: "verification",
      address: result.verification.address,
    });
    return "/verify";
  }

  if (result.session_token) {
    await setSessionToken(result.session_token);
    await clearPendingFlow();
    // A tenant with `mfa: required` returns this until a factor is enrolled.
    return result.state === "mfa_enrollment_required" ? "/mfa" : "/dashboard";
  }

  return "/login";
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const flowId = String(formData.get("flow") ?? "");
  const password = String(formData.get("password") ?? "");

  // Fields are named `traits.email`, `traits.name`, … so the schema drives the
  // form and this code never hardcodes a tenant's trait list.
  const traits: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("traits.") && typeof value === "string" && value) {
      traits[key.slice("traits.".length)] = value;
    }
  }

  let target: string;
  try {
    const result = await pratu.submitRegistration(flowId, traits, password);
    target = await settle(result);
  } catch (error) {
    return fail(error);
  }
  redirect(target);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const flowId = String(formData.get("flow") ?? "");
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");

  let target: string;
  try {
    const outcome = await pratu.submitLogin(flowId, identifier, password);

    if (outcome.kind === "success") {
      target = await settle(outcome.result);
    } else if (outcome.held.state === "verification_required") {
      const verification = outcome.held.verification;
      if (!verification) return { error: "Verification required." };
      await setPendingFlow({
        id: verification.flow_id,
        kind: "verification",
        address: verification.address,
      });
      target = "/verify";
    } else {
      // mfa_required — the login flow itself carries on to the second factor.
      await setPendingFlow({
        id: flowId,
        kind: "login-mfa",
        methods: outcome.held.methods ?? [],
      });
      target = "/login/mfa";
    }
  } catch (error) {
    return fail(error);
  }
  redirect(target);
}

export async function loginTotpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const pending = await getPendingFlow();
  if (!pending) return { error: "This login expired. Please start again." };

  let target: string;
  try {
    target = await settle(await pratu.submitLoginTotp(pending.id, code));
  } catch (error) {
    return fail(error);
  }
  redirect(target);
}

/** Mobile OTP step 1: ask Pratu to text a code to the enrolled phone. */
export async function loginSmsSendAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const pending = await getPendingFlow();
  if (!pending) return { error: "This login expired. Please start again." };

  try {
    const sent = await pratu.sendLoginSms(pending.id);
    await setPendingFlow({ ...pending, address: sent.address });
    return { notice: `We sent a code to ${sent.address ?? "your phone"}.` };
  } catch (error) {
    return fail(error);
  }
}

/** Mobile OTP step 2: prove the code and get an aal2 session. */
export async function loginSmsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const pending = await getPendingFlow();
  if (!pending) return { error: "This login expired. Please start again." };

  let target: string;
  try {
    target = await settle(await pratu.submitLoginSms(pending.id, code));
  } catch (error) {
    return fail(error);
  }
  redirect(target);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export async function verifyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const pending = await getPendingFlow();
  if (!pending) return { error: "This flow expired. Please start again." };

  let target: string;
  try {
    const result = await pratu.submitVerification(pending.id, code);
    // Verification spawned by registration/login issues the session here.
    target = await settle(result);
    if (target === "/login") {
      await clearPendingFlow();
      target = "/login?verified=1";
    }
  } catch (error) {
    return fail(error);
  }
  redirect(target);
}

export async function resendVerificationAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const pending = await getPendingFlow();
  if (!pending) return { error: "This flow expired. Please start again." };
  try {
    await pratu.resendVerification(pending.id);
    return { notice: "A new code is on its way." };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

export async function recoveryStartAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const flowId = String(formData.get("flow") ?? "");
  const address = String(formData.get("address") ?? "");

  try {
    await pratu.submitRecoveryAddress(flowId, address);
    await setPendingFlow({ id: flowId, kind: "recovery", address });
  } catch (error) {
    return fail(error);
  }
  redirect("/recovery/code");
}

export async function recoveryCodeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const pending = await getPendingFlow();
  if (!pending) return { error: "This recovery expired. Please start again." };

  let target: string;
  try {
    const result = await pratu.submitRecoveryCode(pending.id, code);
    if (result.state === "second_factor_required") {
      // Recovery never bypasses MFA.
      await setPendingFlow({ ...pending, methods: result.methods ?? [] });
      target = "/recovery/mfa";
    } else {
      target = "/recovery/password";
    }
  } catch (error) {
    return fail(error);
  }
  redirect(target);
}

export async function recoveryTotpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const pending = await getPendingFlow();
  if (!pending) return { error: "This recovery expired. Please start again." };

  try {
    await pratu.submitRecoveryTotp(pending.id, code);
  } catch (error) {
    return fail(error);
  }
  redirect("/recovery/password");
}

export async function recoverySmsSendAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const pending = await getPendingFlow();
  if (!pending) return { error: "This recovery expired. Please start again." };
  try {
    const sent = await pratu.sendRecoverySms(pending.id);
    return { notice: `We sent a code to ${sent.address ?? "your phone"}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function recoverySmsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const pending = await getPendingFlow();
  if (!pending) return { error: "This recovery expired. Please start again." };

  try {
    await pratu.submitRecoverySms(pending.id, code);
  } catch (error) {
    return fail(error);
  }
  redirect("/recovery/password");
}

export async function recoveryPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const pending = await getPendingFlow();
  if (!pending) return { error: "This recovery expired. Please start again." };

  let target: string;
  try {
    // Completing recovery revokes every other session and issues a fresh one.
    target = await settle(
      await pratu.submitRecoveryPassword(pending.id, password),
    );
  } catch (error) {
    return fail(error);
  }
  redirect(target);
}

// ---------------------------------------------------------------------------
// MFA enrolment
// ---------------------------------------------------------------------------

export async function enrollTotpAction(
  _prev: TotpEnrollState,
  _formData: FormData,
): Promise<TotpEnrollState> {
  const token = await getSessionToken();
  if (!token) redirect("/login");
  try {
    const enrolment = await pratu.enrollTotp(token);
    // The secret stays pending until a code proves the authenticator has it.
    await setPendingFlow({ id: enrolment.flow_id, kind: "mfa-enroll" });
    const { toDataURL } = await import("qrcode");
    return { secret: enrolment.secret, qr: await toDataURL(enrolment.uri) };
  } catch (error) {
    return fail(error);
  }
}

export async function confirmTotpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const token = await getSessionToken();
  if (!token) redirect("/login");
  const pending = await getPendingFlow();
  if (!pending) return { error: "Enrolment expired. Please start again." };

  try {
    await pratu.confirmTotp(token, pending.id, code);
    await clearPendingFlow();
  } catch (error) {
    return fail(error);
  }
  redirect("/dashboard?enrolled=totp");
}

export async function enrollSmsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const phone = String(formData.get("phone") ?? "");
  const token = await getSessionToken();
  if (!token) redirect("/login");

  try {
    const enrolment = await pratu.enrollSms(token, phone);
    await setPendingFlow({
      id: enrolment.flow_id,
      kind: "mfa-enroll",
      address: enrolment.address,
    });
    return { notice: `We sent a code to ${enrolment.address}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function confirmSmsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const token = await getSessionToken();
  if (!token) redirect("/login");
  const pending = await getPendingFlow();
  if (!pending) return { error: "Enrolment expired. Please start again." };

  try {
    await pratu.confirmSms(token, pending.id, code);
    await clearPendingFlow();
  } catch (error) {
    return fail(error);
  }
  redirect("/dashboard?enrolled=sms");
}

export async function unenrollAction(formData: FormData): Promise<void> {
  const factor = String(formData.get("factor") ?? "");
  const token = await getSessionToken();
  if (!token) redirect("/login");

  // Both require an aal2 session; Pratu answers 403 otherwise.
  if (factor === "totp") await pratu.unenrollTotp(token);
  if (factor === "sms") await pratu.unenrollSms(token);
  redirect("/mfa");
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    try {
      await pratu.logout(token);
    } catch {
      // Already expired server-side; drop the cookie regardless.
    }
  }
  await clearSessionToken();
  await clearPendingFlow();
  redirect("/login");
}
