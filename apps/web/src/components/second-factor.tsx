"use client";

import { useState } from "react";

import * as pratu from "@/lib/pratu/api";
import { errorText } from "@/lib/pratu/client";
import type { AuthResult, MfaMethod } from "@/lib/pratu/types";
import { Alert, Button, Card, CodeField, formValues, type Notice } from "./ui";

/**
 * The second-factor step, shared by login and recovery because Pratu exposes
 * the same shape under both: `/{scope}/totp`, `/{scope}/sms/send`,
 * `/{scope}/sms`. Recovery never bypasses MFA, so this screen appears there
 * too.
 *
 * The flow that was held is still the flow being continued — same id, same
 * flow-scope CSRF token.
 */
export function SecondFactor({
  flowId,
  csrf,
  methods,
  scope,
  onDone,
}: {
  flowId: string;
  csrf: string;
  methods: MfaMethod[];
  scope: "login" | "recovery";
  onDone: (state?: string) => void;
}) {
  const hasTotp = methods.includes("totp");
  const hasSms = methods.includes("sms");
  const [via, setVia] = useState<MfaMethod>(hasTotp ? "totp" : "sms");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendSms() {
    setPending(true);
    setNotice(null);
    const result =
      scope === "login"
        ? await pratu.sendLoginSms(flowId, csrf)
        : await pratu.sendRecoverySms(flowId, csrf);
    setPending(false);

    if (!result.ok) {
      return setNotice({ kind: "error", text: errorText(result) });
    }
    setVia("sms");
    setSent(true);
    setNotice({
      kind: "ok",
      text: `We sent a code to ${result.data.address ?? "your phone"}.`,
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = formValues(event)("code");
    setPending(true);
    setNotice(null);

    const result =
      scope === "login"
        ? via === "totp"
          ? await pratu.submitLoginTotp(flowId, csrf, code)
          : await pratu.submitLoginSms(flowId, csrf, code)
        : via === "totp"
          ? await pratu.submitRecoveryTotp(flowId, csrf, code)
          : await pratu.submitRecoverySms(flowId, csrf, code);
    setPending(false);

    if (!result.ok) {
      return setNotice({ kind: "error", text: errorText(result) });
    }
    onDone((result.data as AuthResult).state);
  }

  return (
    <Card
      title="Two-factor authentication"
      subtitle={
        scope === "login"
          ? "Your password was accepted. One more step to prove it is you."
          : "Recovery cannot skip two-factor authentication."
      }
    >
      <Alert notice={notice} />

      {hasTotp && hasSms ? (
        <div className="mb-6 flex gap-2 rounded-lg bg-black/5 p-1 dark:bg-white/10">
          {(["totp", "sms"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setVia(option)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                via === option
                  ? "bg-white shadow-sm dark:bg-neutral-800"
                  : "opacity-70"
              }`}
            >
              {option === "totp" ? "Authenticator" : "SMS"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="space-y-5">
        {via === "sms" ? (
          <Button variant={sent ? "ghost" : "primary"} type="button" onClick={sendSms} pending={pending}>
            {sent ? "Send another code" : "Text me a code"}
          </Button>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <CodeField
            label={
              via === "totp" ? "Code from your authenticator app" : "Code from the SMS"
            }
          />
          <Button pending={pending}>Verify</Button>
        </form>
      </div>
    </Card>
  );
}
