import Link from "next/link";
import { redirect } from "next/navigation";

import { hasPratuCookies, readFlow } from "@/lib/pratu/server";
import { Button, Card, CodeField, Field, FlowForm, Messages } from "@/components/ui";
import { SecondFactor } from "@/components/second-factor";

/**
 * The tenant's login screen, named in `ui.login_url`.
 *
 * Nothing here is tenant-specific. The flow says which first factors it
 * accepts (`ui.methods`) and which step it waits on (`state`), so the same
 * screen serves a password tenant, a passwordless one, and a tenant that
 * takes either.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string; verified?: string }>;
}) {
  const { flow: flowId, verified } = await searchParams;
  if (!flowId) redirect("/self-service/login/browser");

  const flow = await readFlow(flowId);
  if (!flow) {
    // A flow that merely expired can be replaced. A browser that keeps no
    // cookies never gets a readable one, so sending it back to flow creation
    // would loop forever.
    redirect(
      (await hasPratuCookies())
        ? "/self-service/login/browser"
        : "/error?code=cookies_blocked",
    );
  }

  // The held login continues as the same flow, with the same CSRF token.
  if (flow.state === "mfa_required") {
    return <SecondFactor flow={flow} scope="login" />;
  }

  // A first-factor code was sent; the flow now wants the code itself.
  if (flow.state === "code_required") {
    return (
      <Card
        title="Enter your code"
        // Uniform whether or not the identifier exists (ADR 0007), so the copy
        // must not imply an account was found.
        subtitle="If that number is registered, a code is on its way."
      >
        <Messages messages={flow.messages} />
        <FlowForm
          action={`/self-service/login/code?flow=${flow.id}`}
          csrf={flow.csrf_token}
        >
          <CodeField />
          <Button>Sign in</Button>
        </FlowForm>
      </Card>
    );
  }

  const methods = flow.ui?.methods ?? ["password"];
  const takesPassword = methods.includes("password");
  const takesCode = methods.includes("code");
  const identifier = flow.ui?.fields?.find((f) => f.name === "identifier");

  return (
    <Card
      title="Sign in"
      subtitle={
        takesCode && !takesPassword
          ? "We'll text you a one-time code — no password needed."
          : undefined
      }
    >
      <Messages
        messages={flow.messages}
        extra={
          verified
            ? { kind: "ok", text: "Your address is verified. Please sign in." }
            : null
        }
      />

      {takesPassword ? (
        <FlowForm action={`/self-service/login?flow=${flow.id}`} csrf={flow.csrf_token}>
          <input type="hidden" name="method" value="password" />
          <Field
            name="identifier"
            label={identifier?.title ?? "Email"}
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
      ) : null}

      {takesPassword && takesCode ? (
        <div className="my-6 flex items-center gap-3 text-xs text-neutral-500">
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
          or
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        </div>
      ) : null}

      {takesCode ? (
        <FlowForm
          action={`/self-service/login/code/send?flow=${flow.id}`}
          csrf={flow.csrf_token}
        >
          {/* With both factors the identifier is asked twice, once per form —
              a plain form posts to exactly one action. */}
          <Field
            name="identifier"
            label={identifier?.title ?? "Mobile number"}
            type={takesPassword ? "text" : "tel"}
            required
            autoComplete={takesPassword ? undefined : "tel"}
            placeholder={takesPassword ? undefined : "+66812345678"}
          />
          <Button variant={takesPassword ? "ghost" : "primary"}>
            Text me a code
          </Button>
        </FlowForm>
      ) : null}

      <div className="mt-6 flex justify-between text-sm text-neutral-600 dark:text-neutral-400">
        {/* Recovery sets a password; a code-only tenant has none to set. */}
        {takesPassword ? (
          <Link href="/recovery" className="underline">
            Forgot password?
          </Link>
        ) : (
          <span />
        )}
        <Link href="/register" className="underline">
          Create account
        </Link>
      </div>
    </Card>
  );
}
