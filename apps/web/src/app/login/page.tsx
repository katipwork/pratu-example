"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import * as pratu from "@/lib/pratu/api";
import { errorText } from "@/lib/pratu/client";
import { useAfterAuth, useFlow } from "@/lib/pratu/use-flow";
import type { AuthResult, HeldLogin, MfaMethod } from "@/lib/pratu/types";
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
import { SecondFactor } from "@/components/second-factor";

function LoginScreen() {
  const { flow, error } = useFlow("login");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const [methods, setMethods] = useState<MfaMethod[] | null>(null);
  const router = useRouter();
  const afterAuth = useAfterAuth();

  if (error) return <Card title="Sign in">{<Alert notice={{ kind: "error", text: error }} />}</Card>;
  if (!flow) return <Loading />;

  // The login flow stays alive through the second factor: same id, same CSRF.
  if (methods) {
    return (
      <SecondFactor
        flowId={flow.id}
        csrf={flow.csrf_token ?? ""}
        methods={methods}
        scope="login"
        onDone={afterAuth}
      />
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = formValues(event);
    setPending(true);
    setNotice(null);

    const result = await pratu.submitLogin(
      flow!.id,
      flow!.csrf_token ?? "",
      value("identifier"),
      value("password"),
    );
    setPending(false);

    if (result.ok) return afterAuth((result.data as AuthResult).state);

    // 403 here means the password was right and another step is owed.
    const held = result.data as HeldLogin;
    if (result.status === 403 && held.state === "mfa_required") {
      return setMethods(held.methods ?? []);
    }
    if (result.status === 403 && held.state === "verification_required") {
      return router.push(`/verify?flow=${held.verification?.flow_id}`);
    }
    setNotice({ kind: "error", text: errorText(result) });
  }

  return (
    <Card title="Sign in">
      <Alert notice={notice ?? noticeFromFlow(flow.messages)} />
      <form onSubmit={onSubmit} className="space-y-4">
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
        <Button pending={pending}>Sign in</Button>
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

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense fallback={<Loading />}>
      <LoginScreen />
    </Suspense>
  );
}
