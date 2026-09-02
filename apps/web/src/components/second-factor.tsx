import type { Flow, MfaMethod } from "@/lib/pratu/types";
import { Button, Card, CodeField, FlowForm, Messages } from "./ui";

/**
 * The second-factor step, shared by login and recovery — Pratu exposes the
 * same shape under both, and recovery never bypasses MFA.
 *
 * Each method gets its own form, because a plain HTML form posts to exactly
 * one action and there is no JavaScript here to switch between them. Sending
 * an SMS is its own form for the same reason; Pratu answers it with a 303 back
 * to this screen.
 */
export function SecondFactor({
  flow,
  scope,
}: {
  flow: Flow;
  scope: "login" | "recovery";
}) {
  const methods: MfaMethod[] = flow.ui?.methods ?? [];
  const hasTotp = methods.includes("totp");
  const hasSms = methods.includes("sms");
  const base = `/self-service/${scope}`;

  return (
    <Card
      title="Two-factor authentication"
      subtitle={
        scope === "login"
          ? "Your password was accepted. One more step to prove it is you."
          : "Recovery cannot skip two-factor authentication."
      }
    >
      <Messages messages={flow.messages} />

      {hasTotp ? (
        <FlowForm action={`${base}/totp?flow=${flow.id}`} csrf={flow.csrf_token}>
          <CodeField label="Code from your authenticator app" />
          <Button>Verify</Button>
        </FlowForm>
      ) : null}

      {hasTotp && hasSms ? (
        <div className="my-6 flex items-center gap-3 text-xs text-neutral-500">
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
          or
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        </div>
      ) : null}

      {hasSms ? (
        <div className="space-y-4">
          <FlowForm
            action={`${base}/sms/send?flow=${flow.id}`}
            csrf={flow.csrf_token}
          >
            <Button variant="ghost">Text me a code</Button>
          </FlowForm>

          <FlowForm action={`${base}/sms?flow=${flow.id}`} csrf={flow.csrf_token}>
            <CodeField label="Code from the SMS" />
            <Button>Verify</Button>
          </FlowForm>
        </div>
      ) : null}

      {!hasTotp && !hasSms ? (
        <p className="text-sm text-neutral-500">
          No second factor is available on this account.
        </p>
      ) : null}
    </Card>
  );
}
