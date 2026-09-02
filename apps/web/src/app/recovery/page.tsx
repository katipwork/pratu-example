"use client";

import { Suspense, useState } from "react";
import Link from "next/link";

import * as pratu from "@/lib/pratu/api";
import { errorText } from "@/lib/pratu/client";
import { useAfterAuth, useFlow } from "@/lib/pratu/use-flow";
import type { AuthResult, Flow, MfaMethod } from "@/lib/pratu/types";
import {
  Alert,
  Button,
  Card,
  CodeField,
  Field,
  Loading,
  formValues,
  noticeFromFlow,
  type Notice,
} from "@/components/ui";
import { SecondFactor } from "@/components/second-factor";

type Step = "address" | "code" | "factor" | "password";

/** Recovery is one flow with four steps; the flow itself says which is due. */
function stepOf(flow: Flow): Step {
  switch (flow.state) {
    case "code_required":
      return "code";
    case "second_factor_required":
      return "factor";
    case "password_required":
      return "password";
    default:
      return "address";
  }
}

function RecoveryScreen() {
  const { flow, error } = useFlow("recovery");
  const [step, setStep] = useState<Step | null>(null);
  const [methods, setMethods] = useState<MfaMethod[] | null>(null);
  const [address, setAddress] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const afterAuth = useAfterAuth();

  if (error) {
    return (
      <Card title="Reset your password">
        <Alert notice={{ kind: "error", text: error }} />
      </Card>
    );
  }
  if (!flow) return <Loading />;

  // Local progress wins; otherwise trust the flow (covers redirect landings).
  const current = step ?? stepOf(flow);
  const csrf = flow.csrf_token ?? "";

  async function run<T>(
    call: Promise<{ ok: boolean; status: number; data: T }>,
    onOk: (data: T) => void,
  ) {
    setPending(true);
    setNotice(null);
    const result = await call;
    setPending(false);
    if (!result.ok) {
      return setNotice({ kind: "error", text: errorText(result) });
    }
    onOk(result.data);
  }

  if (current === "factor") {
    return (
      <SecondFactor
        flowId={flow.id}
        csrf={csrf}
        methods={methods ?? flow.ui?.methods ?? []}
        scope="recovery"
        onDone={() => setStep("password")}
      />
    );
  }

  if (current === "code") {
    return (
      <Card
        title="Enter your code"
        // Anti-enumeration: the server answers identically whether or not the
        // address exists, so this copy must stay conditional.
        subtitle={
          address
            ? `If ${address} belongs to an account, a code is on its way.`
            : "If that address belongs to an account, a code is on its way."
        }
      >
        <Alert notice={notice ?? noticeFromFlow(flow.messages)} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const code = formValues(event)("code");
            run(pratu.submitRecoveryCode(flow.id, csrf, code), (data) => {
              if (data.state === "second_factor_required") {
                setMethods(data.methods ?? []);
                setStep("factor");
              } else {
                setStep("password");
              }
            });
          }}
          className="space-y-4"
        >
          <CodeField />
          <Button pending={pending}>Continue</Button>
        </form>
      </Card>
    );
  }

  if (current === "password") {
    return (
      <Card
        title="Choose a new password"
        subtitle="Completing this signs you in and logs out every other device."
      >
        <Alert notice={notice ?? noticeFromFlow(flow.messages)} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const password = formValues(event)("password");
            run(
              pratu.submitRecoveryPassword(flow.id, csrf, password),
              (data) => afterAuth((data as AuthResult).state),
            );
          }}
          className="space-y-4"
        >
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
          <Button pending={pending}>Set password</Button>
        </form>
      </Card>
    );
  }

  return (
    <Card
      title="Reset your password"
      subtitle="Enter the address on your account and we'll send a one-time code."
    >
      <Alert notice={notice ?? noticeFromFlow(flow.messages)} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const entered = formValues(event)("address");
          setAddress(entered);
          run(pratu.submitRecoveryAddress(flow.id, csrf, entered), () =>
            setStep("code"),
          );
        }}
        className="space-y-4"
      >
        <Field
          name="address"
          label="Email"
          type="email"
          required
          autoComplete="email"
        />
        <Button pending={pending}>Send code</Button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}

export default function RecoveryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RecoveryScreen />
    </Suspense>
  );
}
