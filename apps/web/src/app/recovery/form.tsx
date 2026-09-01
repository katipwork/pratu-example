"use client";

import { useActionState } from "react";
import Link from "next/link";

import { recoveryStartAction } from "@/app/actions";
import { emptyState } from "@/lib/form-state";
import { Alert, Card, Field, SubmitButton } from "@/components/ui";

export function RecoveryForm({ flowId }: { flowId: string }) {
  const [state, action] = useActionState(recoveryStartAction, emptyState);

  return (
    <Card
      title="Reset your password"
      subtitle="Enter the address on your account and we'll send a one-time code."
    >
      <Alert state={state} />
      <form action={action} className="space-y-4">
        <input type="hidden" name="flow" value={flowId} />
        <Field
          name="address"
          label="Email"
          type="email"
          required
          autoComplete="email"
        />
        <SubmitButton>Send code</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
