"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import * as pratu from "@/lib/pratu/api";
import { errorText } from "@/lib/pratu/client";
import { useAfterAuth, useFlow } from "@/lib/pratu/use-flow";
import type { AuthResult } from "@/lib/pratu/types";
import {
  Alert,
  Button,
  Card,
  Field,
  Loading,
  formValues,
  noticeFromFlow,
  type Notice,
} from "@/components/ui";

function RegisterScreen() {
  const { flow, error } = useFlow("registration");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const afterAuth = useAfterAuth();

  if (error) {
    return (
      <Card title="Create your account">
        <Alert notice={{ kind: "error", text: error }} />
      </Card>
    );
  }
  if (!flow) return <Loading />;

  // `password` is listed beside the schema traits but is a credential, not a
  // trait — it is submitted as its own top-level field.
  const traitFields = (flow.ui?.fields ?? []).filter(
    (field) => field.type !== "password",
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = formValues(event);
    const traits: Record<string, string> = {};
    for (const field of traitFields) {
      const entry = value(field.name);
      if (entry) traits[field.name] = entry;
    }

    setPending(true);
    setNotice(null);
    const result = await pratu.submitRegistration(
      flow!.id,
      flow!.csrf_token ?? "",
      traits,
      value("password"),
    );
    setPending(false);

    if (!result.ok) {
      return setNotice({ kind: "error", text: errorText(result) });
    }

    const auth = result.data as AuthResult;
    // Default policy withholds the session until the address is proven.
    if (auth.state === "verification_required" && auth.verification) {
      return router.push(`/verify?flow=${auth.verification.flow_id}`);
    }
    afterAuth(auth.state);
  }

  return (
    <Card
      title="Create your account"
      subtitle="Traits below come straight from the tenant's Identity Schema."
    >
      <Alert notice={notice ?? noticeFromFlow(flow.messages)} />
      <form onSubmit={onSubmit} className="space-y-4">
        {traitFields.map((field) => {
          // Schema traits report JSON types ("string"), so the input type comes
          // from the trait's role instead.
          const isEmail = field.name.toLowerCase().includes("email");
          return (
            <Field
              key={field.name}
              name={field.name}
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

        <Button pending={pending}>Create account</Button>
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

export default function RegisterPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RegisterScreen />
    </Suspense>
  );
}
