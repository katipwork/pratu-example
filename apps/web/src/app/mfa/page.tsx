import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { whoami } from "@/lib/pratu/server";
import {
  cancelEnrollAction,
  confirmEnrollAction,
  enrollSmsAction,
  enrollTotpAction,
} from "@/app/actions";
import { Button, Card, CodeField, Field, Messages } from "@/components/ui";

/** Pending enrolment lives in a cookie, so the two steps need no client state. */
interface Pending {
  kind: "totp" | "sms";
  flow: string;
  csrf: string;
  secret?: string;
  uri?: string;
  address?: string;
}

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  const session = await whoami();
  if (!session) redirect("/login");

  const store = await cookies();
  const error = store.get("pratu_example_error")?.value;
  const raw = store.get("pratu_example_enroll")?.value;
  const pending: Pending | null = raw ? JSON.parse(raw) : null;

  if (step === "confirm" && pending) {
    return <ConfirmStep pending={pending} error={error} />;
  }

  return (
    <Card
      title="Two-factor authentication"
      subtitle="Add a second factor. Enrolling raises this session to aal2."
    >
      <Messages extra={error ? { kind: "error", text: error } : null} />

      {/* v0.3.1 has no endpoint listing enrolled factors, so neither option can
          show a tick; re-enrolling answers 409. */}
      <form action={enrollTotpAction} className="space-y-4">
        <p className="text-sm font-medium">Authenticator app</p>
        <Button>Set up authenticator app</Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-neutral-500">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        or
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
      </div>

      <form action={enrollSmsAction} className="space-y-4">
        <Field
          name="phone"
          label="Mobile number"
          type="tel"
          required
          autoComplete="tel"
          placeholder="+66812345678"
          hint="International format, including the country code."
        />
        <Button variant="ghost">Send code</Button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href="/dashboard" className="underline">
          Back
        </Link>
      </p>
    </Card>
  );
}

async function ConfirmStep({
  pending,
  error,
}: {
  pending: Pending;
  error?: string;
}) {
  // Rendered on the server; the QR never needs client JavaScript.
  let qr: string | null = null;
  if (pending.kind === "totp" && pending.uri) {
    const { toDataURL } = await import("qrcode");
    qr = await toDataURL(pending.uri);
  }

  return (
    <Card
      title={pending.kind === "totp" ? "Scan the QR code" : "Check your phone"}
      subtitle={
        pending.kind === "totp"
          ? "Then enter the six-digit code to finish."
          : `We sent a code to ${pending.address ?? "your phone"}.`
      }
    >
      <Messages extra={error ? { kind: "error", text: error } : null} />

      {pending.kind === "totp" ? (
        <div className="mb-5 flex flex-col items-center gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
          {qr ? (
            <Image
              src={qr}
              alt="Scan this QR code with your authenticator app"
              width={192}
              height={192}
              unoptimized
              className="rounded bg-white p-2"
            />
          ) : null}
          <p className="text-xs text-neutral-500">Or enter this key manually</p>
          <code className="break-all rounded bg-black/5 px-2 py-1 text-center font-mono text-xs dark:bg-white/10">
            {pending.secret}
          </code>
        </div>
      ) : null}

      <form action={confirmEnrollAction} className="space-y-4">
        <CodeField label="Confirmation code" />
        <Button>Confirm</Button>
      </form>

      <form action={cancelEnrollAction} className="mt-3">
        <Button variant="ghost">Cancel</Button>
      </form>
    </Card>
  );
}
