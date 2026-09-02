"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";

import * as pratu from "@/lib/pratu/api";
import { errorText } from "@/lib/pratu/client";
import { useAfterAuth, useFlow } from "@/lib/pratu/use-flow";
import type { AuthResult } from "@/lib/pratu/types";
import {
  Alert,
  Button,
  Card,
  CodeField,
  Loading,
  formValues,
  noticeFromFlow,
  type Notice,
} from "@/components/ui";

function VerifyScreen() {
  // Always landed on with ?flow= — registration and held logins spawn the flow.
  const { flow, error } = useFlow("verification");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const afterAuth = useAfterAuth();

  if (error) {
    return (
      <Card title="Check your inbox">
        <Alert notice={{ kind: "error", text: error }} />
      </Card>
    );
  }
  if (!flow) return <Loading />;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    const result = await pratu.submitVerification(
      flow!.id,
      flow!.csrf_token ?? "",
      formValues(event)("code"),
    );
    setPending(false);

    if (!result.ok) {
      return setNotice({ kind: "error", text: errorText(result) });
    }

    const auth = result.data as AuthResult;
    // A verification spawned by registration issues the session here; one that
    // merely proved an address leaves the user to sign in.
    if (auth.session) return afterAuth(auth.state);
    router.push("/login");
  }

  async function resend() {
    setPending(true);
    const result = await pratu.resendVerification(
      flow!.id,
      flow!.csrf_token ?? "",
    );
    setPending(false);
    setNotice(
      result.ok
        ? { kind: "ok", text: "A new code is on its way." }
        : { kind: "error", text: errorText(result) },
    );
  }

  return (
    <Card title="Check your inbox" subtitle="We sent you a one-time code.">
      <Alert notice={notice ?? noticeFromFlow(flow.messages)} />
      <form onSubmit={onSubmit} className="space-y-4">
        <CodeField />
        <p className="text-xs text-neutral-500">
          The code expires shortly and is invalidated after five wrong attempts.
        </p>
        <Button pending={pending}>Verify</Button>
      </form>
      <div className="mt-3">
        <Button variant="ghost" type="button" onClick={resend} pending={pending}>
          Resend code
        </Button>
      </div>
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <VerifyScreen />
    </Suspense>
  );
}
