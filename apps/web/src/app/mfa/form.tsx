"use client";

import { useActionState, useState } from "react";
import Image from "next/image";

import {
  confirmSmsAction,
  confirmTotpAction,
  enrollSmsAction,
  enrollTotpAction,
} from "@/app/actions";
import { emptyState } from "@/lib/form-state";
import { Alert, Card, CodeField, Field, SubmitButton } from "@/components/ui";
import type { TotpEnrollState } from "@/lib/form-state";

/**
 * v0.3.1 exposes no "list my enrolled factors" endpoint — `whoami` returns the
 * session and identity only. A tab therefore cannot show an enrolled tick; the
 * server answers 409 on re-enrolment, which surfaces as an error message.
 */
export function MfaEnrollForm() {
  const [tab, setTab] = useState<"totp" | "sms">("totp");

  return (
    <Card
      title="Two-factor authentication"
      subtitle="Add a second factor. Enrolling raises this session to aal2."
    >
      <div className="mb-6 flex gap-2 rounded-lg bg-black/5 p-1 dark:bg-white/10">
        <button
          onClick={() => setTab("totp")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            tab === "totp" ? "bg-white shadow-sm dark:bg-neutral-800" : "opacity-70"
          }`}
        >
          Authenticator
        </button>
        <button
          onClick={() => setTab("sms")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            tab === "sms" ? "bg-white shadow-sm dark:bg-neutral-800" : "opacity-70"
          }`}
        >
          SMS
        </button>
      </div>

      {tab === "totp" ? <TotpEnroll /> : <SmsEnroll />}
    </Card>
  );
}

function TotpEnroll() {
  const initial: TotpEnrollState = {};
  const [enrollState, enroll] = useActionState(enrollTotpAction, initial);
  const [confirmState, confirm] = useActionState(confirmTotpAction, emptyState);

  return (
    <div className="space-y-5">
      <Alert state={enrollState} />

      {!enrollState.secret ? (
        <form action={enroll}>
          <SubmitButton>Set up authenticator app</SubmitButton>
        </form>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
            {enrollState.qr ? (
              <Image
                src={enrollState.qr}
                alt="Scan this QR code with your authenticator app"
                width={192}
                height={192}
                unoptimized
                className="rounded bg-white p-2"
              />
            ) : null}
            <p className="text-xs text-neutral-500">Or enter this key manually</p>
            <code className="break-all rounded bg-black/5 px-2 py-1 text-center font-mono text-xs dark:bg-white/10">
              {enrollState.secret}
            </code>
          </div>

          <form action={confirm} className="space-y-4">
            <Alert state={confirmState} />
            <CodeField label="Enter the 6-digit code to confirm" />
            <SubmitButton>Confirm</SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}

function SmsEnroll() {
  const [enrollState, enroll] = useActionState(enrollSmsAction, emptyState);
  const [confirmState, confirm] = useActionState(confirmSmsAction, emptyState);
  const sent = Boolean(enrollState.notice);

  return (
    <div className="space-y-5">
      <form action={enroll} className="space-y-4">
        <Alert state={enrollState} />
        <Field
          name="phone"
          label="Mobile number"
          type="tel"
          required
          autoComplete="tel"
          placeholder="+66812345678"
        />
        <p className="text-xs text-neutral-500">
          International format, including the country code.
        </p>
        <SubmitButton variant={sent ? "ghost" : "primary"}>
          {sent ? "Resend code" : "Send code"}
        </SubmitButton>
      </form>

      {sent ? (
        <form action={confirm} className="space-y-4">
          <Alert state={confirmState} />
          <CodeField label="Code from the SMS" />
          <SubmitButton>Confirm</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
