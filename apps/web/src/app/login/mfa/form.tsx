"use client";

import { useActionState, useState } from "react";

import {
  loginSmsAction,
  loginSmsSendAction,
  loginTotpAction,
} from "@/app/actions";
import { emptyState } from "@/lib/form-state";
import { Alert, Card, CodeField, SubmitButton } from "@/components/ui";

/**
 * Second-factor screen for a held login.
 *
 * Pratu answered the password submission with 403 `{state: "mfa_required",
 * methods}`. The login flow is still alive — proving a factor against it
 * upgrades the session to aal2.
 */
export function MfaForm({ methods }: { methods: string[] }) {
  const hasTotp = methods.includes("totp");
  const hasSms = methods.includes("sms");
  const [method, setMethod] = useState(hasTotp ? "totp" : "sms");

  return (
    <Card
      title="Two-factor authentication"
      subtitle="Your password was accepted. One more step to prove it is you."
    >
      {hasTotp && hasSms ? (
        <div className="mb-6 flex gap-2 rounded-lg bg-black/5 p-1 dark:bg-white/10">
          <button
            onClick={() => setMethod("totp")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              method === "totp"
                ? "bg-white shadow-sm dark:bg-neutral-800"
                : "opacity-70"
            }`}
          >
            Authenticator
          </button>
          <button
            onClick={() => setMethod("sms")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              method === "sms"
                ? "bg-white shadow-sm dark:bg-neutral-800"
                : "opacity-70"
            }`}
          >
            SMS
          </button>
        </div>
      ) : null}

      {method === "totp" && hasTotp ? <TotpPanel /> : null}
      {method === "sms" && hasSms ? <SmsPanel /> : null}
    </Card>
  );
}

function TotpPanel() {
  const [state, action] = useActionState(loginTotpAction, emptyState);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <CodeField label="Code from your authenticator app" />
      <SubmitButton>Verify</SubmitButton>
    </form>
  );
}

/**
 * Mobile OTP: a code is texted to the phone enrolled as the second factor.
 * Sending and verifying are two separate endpoints, so they are two forms.
 */
function SmsPanel() {
  const [sendState, sendAction] = useActionState(
    loginSmsSendAction,
    emptyState,
  );
  const [verifyState, verifyAction] = useActionState(
    loginSmsAction,
    emptyState,
  );
  const sent = Boolean(sendState.notice);

  return (
    <div className="space-y-5">
      <Alert state={sendState} />

      <form action={sendAction}>
        <SubmitButton variant={sent ? "ghost" : "primary"}>
          {sent ? "Send another code" : "Text me a code"}
        </SubmitButton>
      </form>

      <form action={verifyAction} className="space-y-4">
        <Alert state={verifyState} />
        <CodeField label="Code from the SMS" />
        <SubmitButton>Verify</SubmitButton>
      </form>
    </div>
  );
}
