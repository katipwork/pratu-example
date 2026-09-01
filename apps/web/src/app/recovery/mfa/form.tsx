"use client";

import { useActionState, useState } from "react";

import {
  recoverySmsAction,
  recoverySmsSendAction,
  recoveryTotpAction,
} from "@/app/actions";
import { emptyState } from "@/lib/form-state";
import { Alert, Card, CodeField, SubmitButton } from "@/components/ui";

/**
 * Recovery never bypasses MFA — proving the emailed code is not enough when a
 * second factor is enrolled. Same two endpoints as login, under /recovery.
 */
export function RecoveryMfaForm({ methods }: { methods: string[] }) {
  const hasTotp = methods.includes("totp");
  const hasSms = methods.includes("sms");
  const [method, setMethod] = useState(hasTotp ? "totp" : "sms");

  return (
    <Card
      title="Confirm your second factor"
      subtitle="Recovery cannot skip two-factor authentication."
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
  const [state, action] = useActionState(recoveryTotpAction, emptyState);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <CodeField label="Code from your authenticator app" />
      <SubmitButton>Continue</SubmitButton>
    </form>
  );
}

function SmsPanel() {
  const [sendState, sendAction] = useActionState(
    recoverySmsSendAction,
    emptyState,
  );
  const [verifyState, verifyAction] = useActionState(
    recoverySmsAction,
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
        <SubmitButton>Continue</SubmitButton>
      </form>
    </div>
  );
}
