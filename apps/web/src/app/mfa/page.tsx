"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import * as pratu from "@/lib/pratu/api";
import { errorText } from "@/lib/pratu/client";
import { useSession } from "@/lib/pratu/use-session";
import {
  Alert,
  Button,
  Card,
  CodeField,
  Field,
  Loading,
  formValues,
  type Notice,
} from "@/components/ui";

/**
 * MFA enrolment.
 *
 * These are session-scoped endpoints, not flows, so they authenticate with the
 * `pratu_session` cookie and need the session CSRF token in `X-CSRF-Token`.
 * The enrolment itself still returns a flow id plus its own flow-scope token,
 * which the confirm step echoes in the body.
 *
 * v0.3.1 exposes no "list my enrolled factors" endpoint, so neither tab can
 * show an enrolled tick; re-enrolling answers 409.
 */
export default function MfaPage() {
  const { session, loading } = useSession();
  const [tab, setTab] = useState<"totp" | "sms">("totp");
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session) return <Loading />;
  const sessionCsrf = session.csrf_token ?? "";

  return (
    <Card
      title="Two-factor authentication"
      subtitle="Add a second factor. Enrolling raises this session to aal2."
    >
      <div className="mb-6 flex gap-2 rounded-lg bg-black/5 p-1 dark:bg-white/10">
        {(["totp", "sms"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === option
                ? "bg-white shadow-sm dark:bg-neutral-800"
                : "opacity-70"
            }`}
          >
            {option === "totp" ? "Authenticator" : "SMS"}
          </button>
        ))}
      </div>

      {tab === "totp" ? (
        <TotpEnroll sessionCsrf={sessionCsrf} />
      ) : (
        <SmsEnroll sessionCsrf={sessionCsrf} />
      )}
    </Card>
  );
}

function TotpEnroll({ sessionCsrf }: { sessionCsrf: string }) {
  const [enrolment, setEnrolment] = useState<{
    flowId: string;
    csrf: string;
    secret: string;
    qr: string;
  } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function begin() {
    setPending(true);
    setNotice(null);
    const result = await pratu.enrollTotp(sessionCsrf);
    if (!result.ok) {
      setPending(false);
      return setNotice({ kind: "error", text: errorText(result) });
    }
    // Rendered client-side; `qrcode` ships a browser build.
    const { toDataURL } = await import("qrcode");
    setEnrolment({
      flowId: result.data.flow_id,
      csrf: result.data.csrf_token ?? "",
      secret: result.data.secret,
      qr: await toDataURL(result.data.uri),
    });
    setPending(false);
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    const result = await pratu.confirmTotp(
      enrolment!.flowId,
      formValues(event)("code"),
      enrolment!.csrf,
      sessionCsrf,
    );
    setPending(false);
    if (!result.ok) {
      return setNotice({ kind: "error", text: errorText(result) });
    }
    router.push("/dashboard?enrolled=totp");
  }

  return (
    <div className="space-y-5">
      <Alert notice={notice} />

      {!enrolment ? (
        <Button type="button" onClick={begin} pending={pending}>
          Set up authenticator app
        </Button>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
            <Image
              src={enrolment.qr}
              alt="Scan this QR code with your authenticator app"
              width={192}
              height={192}
              unoptimized
              className="rounded bg-white p-2"
            />
            <p className="text-xs text-neutral-500">
              Or enter this key manually
            </p>
            <code className="break-all rounded bg-black/5 px-2 py-1 text-center font-mono text-xs dark:bg-white/10">
              {enrolment.secret}
            </code>
          </div>

          <form onSubmit={confirm} className="space-y-4">
            <CodeField label="Enter the 6-digit code to confirm" />
            <Button pending={pending}>Confirm</Button>
          </form>
        </>
      )}
    </div>
  );
}

function SmsEnroll({ sessionCsrf }: { sessionCsrf: string }) {
  const [enrolment, setEnrolment] = useState<{
    flowId: string;
    csrf: string;
  } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function begin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    const result = await pratu.enrollSms(formValues(event)("phone"), sessionCsrf);
    setPending(false);
    if (!result.ok) {
      return setNotice({ kind: "error", text: errorText(result) });
    }
    setEnrolment({
      flowId: result.data.flow_id,
      csrf: result.data.csrf_token ?? "",
    });
    setNotice({ kind: "ok", text: `We sent a code to ${result.data.address}.` });
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    const result = await pratu.confirmSms(
      enrolment!.flowId,
      formValues(event)("code"),
      enrolment!.csrf,
      sessionCsrf,
    );
    setPending(false);
    if (!result.ok) {
      return setNotice({ kind: "error", text: errorText(result) });
    }
    router.push("/dashboard?enrolled=sms");
  }

  return (
    <div className="space-y-5">
      <Alert notice={notice} />

      <form onSubmit={begin} className="space-y-4">
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
        <Button variant={enrolment ? "ghost" : "primary"} pending={pending}>
          {enrolment ? "Resend code" : "Send code"}
        </Button>
      </form>

      {enrolment ? (
        <form onSubmit={confirm} className="space-y-4">
          <CodeField label="Code from the SMS" />
          <Button pending={pending}>Confirm</Button>
        </form>
      ) : null}
    </div>
  );
}
