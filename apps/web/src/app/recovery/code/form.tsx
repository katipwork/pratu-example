"use client";

import { useActionState } from "react";

import { recoveryCodeAction } from "@/app/actions";
import { emptyState } from "@/lib/form-state";
import { Alert, Card, CodeField, SubmitButton } from "@/components/ui";

export function RecoveryCodeForm({ address }: { address?: string }) {
  const [state, action] = useActionState(recoveryCodeAction, emptyState);

  return (
    <Card
      title="Enter your code"
      // Anti-enumeration: the server answers identically whether or not the
      // address exists, so the copy must stay conditional.
      subtitle={
        address
          ? `If ${address} belongs to an account, a code is on its way.`
          : "If that address belongs to an account, a code is on its way."
      }
    >
      <Alert state={state} />
      <form action={action} className="space-y-4">
        <CodeField />
        <SubmitButton>Continue</SubmitButton>
      </form>
    </Card>
  );
}
