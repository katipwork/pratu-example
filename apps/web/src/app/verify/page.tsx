import { redirect } from "next/navigation";

import { readFlow } from "@/lib/pratu/server";
import { Button, Card, CodeField, FlowForm, Messages } from "@/components/ui";

/**
 * The tenant's verification screen (`ui.verification_url`).
 *
 * Unlike the others this flow is never started here — registration and held
 * logins spawn it and Pratu redirects the browser over with `?flow=`.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>;
}) {
  const { flow: flowId } = await searchParams;
  if (!flowId) redirect("/login");

  const flow = await readFlow(flowId);
  if (!flow) redirect("/login");

  return (
    <Card title="Check your inbox" subtitle="We sent you a one-time code.">
      <Messages messages={flow.messages} />

      <FlowForm
        action={`/self-service/verification?flow=${flow.id}`}
        csrf={flow.csrf_token}
      >
        <CodeField />
        <p className="text-xs text-neutral-500">
          The code expires shortly and is invalidated after five wrong attempts.
        </p>
        <Button>Verify</Button>
      </FlowForm>

      <div className="mt-3">
        <FlowForm
          action={`/self-service/verification/resend?flow=${flow.id}`}
          csrf={flow.csrf_token}
        >
          <Button variant="ghost">Resend code</Button>
        </FlowForm>
      </div>
    </Card>
  );
}
