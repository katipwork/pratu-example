"use client";

import { useActionState } from "react";

import {
  resendVerificationAction,
  verifyAction,
} from "@/app/actions";
import { emptyState } from "@/lib/form-state";
import { Alert, Card, CodeField, SubmitButton } from "@/components/ui";

export function VerifyForm({ address }: { address?: string }) {
  const [state, action] = useActionState(verifyAction, emptyState);
  const [resendState, resendAction] = useActionState(
    resendVerificationAction,
    emptyState,
  );

  return (
    <Card
      title="Check your inbox"
      subtitle={
        address
          ? `We sent a one-time code to ${address}.`
          : "We sent you a one-time code."
      }
    >
      <Alert state={resendState} />

      <form action={action} className="space-y-4">
        <Alert state={state} />
        <CodeField />
        {/* Five wrong attempts invalidate the code server-side. */}
        <p className="text-xs text-neutral-500">
          The code expires shortly and is invalidated after five wrong attempts.
        </p>
        <SubmitButton>Verify</SubmitButton>
      </form>

      <form action={resendAction} className="mt-3">
        <SubmitButton variant="ghost">Resend code</SubmitButton>
      </form>
    </Card>
  );
}
