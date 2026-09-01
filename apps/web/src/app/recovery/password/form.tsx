"use client";

import { useActionState } from "react";

import { recoveryPasswordAction } from "@/app/actions";
import { emptyState } from "@/lib/form-state";
import { Alert, Card, Field, SubmitButton } from "@/components/ui";

export function RecoveryPasswordForm() {
  const [state, action] = useActionState(recoveryPasswordAction, emptyState);

  return (
    <Card
      title="Choose a new password"
      subtitle="Completing this signs you in and logs out every other device."
    >
      <Alert state={state} />
      <form action={action} className="space-y-4">
        <Field
          name="password"
          label="New password"
          type="password"
          required
          autoComplete="new-password"
        />
        <p className="text-xs text-neutral-500">
          At least 10 characters. Checked against known breached passwords.
        </p>
        <SubmitButton>Set password</SubmitButton>
      </form>
    </Card>
  );
}
