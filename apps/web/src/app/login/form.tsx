"use client";

import { useActionState } from "react";
import Link from "next/link";

import { loginAction } from "@/app/actions";
import { emptyState } from "@/lib/form-state";
import { Alert, Card, Field, SubmitButton } from "@/components/ui";

export function LoginForm({
  flowId,
  verified,
}: {
  flowId: string;
  verified?: boolean;
}) {
  const [state, action] = useActionState(loginAction, emptyState);

  return (
    <Card title="Sign in">
      {verified ? (
        <p className="mb-4 rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
          Your address is verified. Please sign in.
        </p>
      ) : null}
      <Alert state={state} />

      <form action={action} className="space-y-4">
        <input type="hidden" name="flow" value={flowId} />
        <Field
          name="identifier"
          label="Email"
          type="email"
          required
          autoComplete="username"
        />
        <Field
          name="password"
          label="Password"
          type="password"
          required
          autoComplete="current-password"
        />
        <SubmitButton>Sign in</SubmitButton>
      </form>

      <div className="mt-6 flex justify-between text-sm text-neutral-600 dark:text-neutral-400">
        <Link href="/recovery" className="underline">
          Forgot password?
        </Link>
        <Link href="/register" className="underline">
          Create account
        </Link>
      </div>
    </Card>
  );
}
