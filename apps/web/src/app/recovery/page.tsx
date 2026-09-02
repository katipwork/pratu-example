import Link from "next/link";
import { redirect } from "next/navigation";

import { readFlow } from "@/lib/pratu/server";
import { Button, Card, CodeField, Field, FlowForm, Messages } from "@/components/ui";
import { SecondFactor } from "@/components/second-factor";

export const dynamic = "force-dynamic";

/**
 * The tenant's recovery screen (`ui.recovery_url`).
 *
 * One screen, four steps. Pratu redirects back here after every submission and
 * the flow reports which step it now waits on, so nothing has to be remembered
 * on our side.
 */
export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>;
}) {
  const { flow: flowId } = await searchParams;
  if (!flowId) redirect("/self-service/recovery/browser");

  const flow = await readFlow(flowId);
  if (!flow) redirect("/self-service/recovery/browser");

  const action = (path: string) => `/self-service/recovery${path}?flow=${flow.id}`;

  if (flow.state === "second_factor_required") {
    return <SecondFactor flow={flow} scope="recovery" />;
  }

  if (flow.state === "code_required") {
    return (
      <Card
        title="Enter your code"
        // Anti-enumeration: the answer is identical whether or not the address
        // exists, so this copy must stay conditional.
        subtitle="If that address belongs to an account, a code is on its way."
      >
        <Messages messages={flow.messages} />
        <FlowForm action={action("/code")} csrf={flow.csrf_token}>
          <CodeField />
          <Button>Continue</Button>
        </FlowForm>
      </Card>
    );
  }

  if (flow.state === "password_required") {
    return (
      <Card
        title="Choose a new password"
        subtitle="Completing this signs you in and logs out every other device."
      >
        <Messages messages={flow.messages} />
        <FlowForm action={action("/password")} csrf={flow.csrf_token}>
          <Field
            name="password"
            label="New password"
            type="password"
            required
            autoComplete="new-password"
            hint="At least 10 characters. Checked against known breached passwords."
          />
          <Button>Set password</Button>
        </FlowForm>
      </Card>
    );
  }

  return (
    <Card
      title="Reset your password"
      subtitle="Enter the address on your account and we'll send a one-time code."
    >
      <Messages messages={flow.messages} />
      <FlowForm action={action("")} csrf={flow.csrf_token}>
        <Field
          name="address"
          label="Email"
          type="email"
          required
          autoComplete="email"
        />
        <Button>Send code</Button>
      </FlowForm>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
