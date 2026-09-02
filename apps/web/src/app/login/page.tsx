import Link from "next/link";
import { redirect } from "next/navigation";

import { readFlow } from "@/lib/pratu/server";
import { Button, Card, Field, FlowForm, Messages } from "@/components/ui";
import { SecondFactor } from "@/components/second-factor";

/**
 * The tenant's login screen, named in `ui.login_url`.
 *
 * Pratu redirects the browser here with `?flow=`; landing without one means
 * the journey has not started, so we hand the browser to the flow-creation
 * endpoint and it comes back with the id. All server-rendered — no JavaScript
 * takes part.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string; verified?: string }>;
}) {
  const { flow: flowId, verified } = await searchParams;
  if (!flowId) redirect("/self-service/login/browser");

  const flow = await readFlow(flowId);
  // Expired, or belongs to a different browser — start over.
  if (!flow) redirect("/self-service/login/browser");

  // The held login continues as the same flow, with the same CSRF token.
  if (flow.state === "mfa_required") {
    return <SecondFactor flow={flow} scope="login" />;
  }

  return (
    <Card title="Sign in">
      <Messages
        messages={flow.messages}
        extra={
          verified
            ? { kind: "ok", text: "Your address is verified. Please sign in." }
            : null
        }
      />

      <FlowForm action={`/self-service/login?flow=${flow.id}`} csrf={flow.csrf_token}>
        <input type="hidden" name="method" value="password" />
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
        <Button>Sign in</Button>
      </FlowForm>

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
