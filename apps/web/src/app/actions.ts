"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { errorText, sessionCall } from "@/lib/pratu/server";
import type { SmsEnrollment, TotpEnrollment } from "@/lib/pratu/types";

/**
 * Server actions for the session-scoped endpoints.
 *
 * Flow submissions are plain form posts straight to Pratu — no action needed.
 * These cannot be, because Pratu requires the session-scope CSRF token in an
 * `X-CSRF-Token` header and an HTML form can only send a body. A server action
 * sets the header on the browser's behalf.
 *
 * Next renders these as ordinary form posts, so they still work with
 * JavaScript disabled.
 */

/** Carries a pending MFA enrolment between the two steps, without JS state. */
const ENROLL_COOKIE = "pratu_example_enroll";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 900,
} as const;

async function fail(message: string, to: string): Promise<never> {
  const store = await cookies();
  store.set("pratu_example_error", message, { ...cookieOptions, maxAge: 30 });
  redirect(to);
}

export async function logoutAction(): Promise<void> {
  await sessionCall("/self-service/logout");
  redirect("/login");
}

export async function unenrollAction(formData: FormData): Promise<void> {
  const factor = String(formData.get("factor") ?? "");
  if (factor !== "totp" && factor !== "sms") redirect("/dashboard");

  // Both need an aal2 session; Pratu answers 403 otherwise.
  const result = await sessionCall(`/self-service/mfa/${factor}`, {
    method: "DELETE",
  });
  if (!result.ok) {
    await fail(errorText(result.data, result.status), "/dashboard");
  }
  redirect("/dashboard?removed=" + factor);
}

export async function enrollTotpAction(): Promise<void> {
  const result = await sessionCall("/self-service/mfa/totp/enroll");
  if (!result.ok) {
    await fail(errorText(result.data, result.status), "/mfa");
  }

  const enrolment = result.data as TotpEnrollment;
  const store = await cookies();
  store.set(
    ENROLL_COOKIE,
    JSON.stringify({
      kind: "totp",
      flow: enrolment.flow_id,
      csrf: enrolment.csrf_token ?? "",
      secret: enrolment.secret,
      uri: enrolment.uri,
    }),
    cookieOptions,
  );
  redirect("/mfa?step=confirm");
}

export async function enrollSmsAction(formData: FormData): Promise<void> {
  const phone = String(formData.get("phone") ?? "");
  const result = await sessionCall("/self-service/mfa/sms/enroll", {
    method: "POST",
    body: { phone },
  });
  if (!result.ok) {
    await fail(errorText(result.data, result.status), "/mfa");
  }

  const enrolment = result.data as SmsEnrollment;
  const store = await cookies();
  store.set(
    ENROLL_COOKIE,
    JSON.stringify({
      kind: "sms",
      flow: enrolment.flow_id,
      csrf: enrolment.csrf_token ?? "",
      address: enrolment.address,
    }),
    cookieOptions,
  );
  redirect("/mfa?step=confirm");
}

export async function confirmEnrollAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "");
  const store = await cookies();
  const raw = store.get(ENROLL_COOKIE)?.value;
  if (!raw) redirect("/mfa");

  const pending = JSON.parse(raw) as { kind: string; flow: string; csrf: string };
  const result = await sessionCall(
    `/self-service/mfa/${pending.kind}/confirm?flow=${pending.flow}`,
    { method: "POST", body: { code, csrf_token: pending.csrf } },
  );
  if (!result.ok) {
    await fail(errorText(result.data, result.status), "/mfa?step=confirm");
  }

  store.delete(ENROLL_COOKIE);
  redirect("/dashboard?enrolled=" + pending.kind);
}

export async function cancelEnrollAction(): Promise<void> {
  const store = await cookies();
  store.delete(ENROLL_COOKIE);
  redirect("/mfa");
}
