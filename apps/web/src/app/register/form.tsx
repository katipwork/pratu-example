"use client";

import { useActionState } from "react";
import Link from "next/link";

import { registerAction } from "@/app/actions";
import { emptyState } from "@/lib/form-state";
import { Alert, Card, Field, SubmitButton } from "@/components/ui";
import type { UiField } from "@/lib/pratu/types";

export function RegisterForm({
  flowId,
  fields,
}: {
  flowId: string;
  fields: UiField[];
}) {
  const [state, action] = useActionState(registerAction, emptyState);

  // The flow lists `password` alongside the schema traits, but it is a
  // credential, not a trait — it is submitted as its own top-level field and
  // must never end up inside `traits`.
  const traitFields = fields.filter((field) => field.type !== "password");

  return (
    <Card
      title="Create your account"
      subtitle="Traits below come straight from the tenant's Identity Schema."
    >
      <Alert state={state} />
      <form action={action} className="space-y-4">
        <input type="hidden" name="flow" value={flowId} />

        {traitFields.map((field) => {
          // Schema traits report JSON types ("string"), so the input type comes
          // from the trait's role instead.
          const isEmail = field.name.toLowerCase().includes("email");
          return (
            <Field
              key={field.name}
              name={`traits.${field.name}`}
              label={field.title ?? field.name}
              type={isEmail ? "email" : "text"}
              required={field.required}
              autoComplete={isEmail ? "email" : undefined}
            />
          );
        })}

        <Field
          name="password"
          label="Password"
          type="password"
          required
          autoComplete="new-password"
        />
        {/* NIST 800-63B: length + breach check only, so no composition hints. */}
        <p className="text-xs text-neutral-500">
          At least 10 characters. Checked against known breached passwords.
        </p>

        <SubmitButton>Create account</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
