"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import * as pratu from "@/lib/pratu/api";
import { errorText } from "@/lib/pratu/client";
import { useSession } from "@/lib/pratu/use-session";
import { Alert, Button, Loading, type Notice } from "@/components/ui";

function DashboardScreen() {
  const { session, loading, reload } = useSession();
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const enrolled = useSearchParams().get("enrolled");

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session) return <Loading />;

  const { session: current, identity, csrf_token: sessionCsrf = "" } = session;

  async function signOut() {
    setPending(true);
    await pratu.logout(sessionCsrf);
    router.push("/login");
  }

  async function unenroll(factor: "totp" | "sms") {
    setPending(true);
    setNotice(null);
    // Both need an aal2 session; Pratu answers 403 otherwise.
    const result =
      factor === "totp"
        ? await pratu.unenrollTotp(sessionCsrf)
        : await pratu.unenrollSms(sessionCsrf);
    setPending(false);
    if (!result.ok) {
      return setNotice({ kind: "error", text: errorText(result) });
    }
    setNotice({ kind: "ok", text: `Removed the ${factor} factor.` });
    reload();
  }

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/15 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Signed in</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Session data straight from <code>GET /sessions/whoami</code>.
          </p>
        </div>
        <div className="w-32">
          <Button variant="ghost" type="button" onClick={signOut} pending={pending}>
            Sign out
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <Alert
          notice={
            notice ??
            (enrolled
              ? {
                  kind: "ok",
                  text: `${enrolled === "totp" ? "Authenticator app" : "SMS"} enrolled.`,
                }
              : null)
          }
        />
      </div>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="font-medium text-neutral-500">Identity</dt>
        <dd className="font-mono text-xs break-all">{identity.id}</dd>

        <dt className="font-medium text-neutral-500">Assurance</dt>
        <dd>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              current.aal === "aal2"
                ? "bg-green-600/15 text-green-800 dark:text-green-300"
                : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
            }`}
          >
            {current.aal}
          </span>
          <span className="ml-2 text-neutral-500">
            {current.aal === "aal2"
              ? "a second factor was proven"
              : "password only"}
          </span>
        </dd>

        <dt className="font-medium text-neutral-500">Traits</dt>
        <dd>
          <pre className="overflow-x-auto rounded-lg bg-black/5 p-3 text-xs dark:bg-white/10">
            {JSON.stringify(identity.traits, null, 2)}
          </pre>
        </dd>

        {identity.addresses?.length ? (
          <>
            <dt className="font-medium text-neutral-500">Addresses</dt>
            <dd className="space-y-1">
              {identity.addresses.map((address) => (
                <div key={address.id} className="flex items-center gap-2">
                  <span className="font-mono text-xs">{address.value}</span>
                  <span className="text-xs text-neutral-500">
                    {address.channel}
                  </span>
                  <span
                    className={`text-xs ${
                      address.verified
                        ? "text-green-700 dark:text-green-400"
                        : "text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {address.verified ? "verified" : "unverified"}
                  </span>
                </div>
              ))}
            </dd>
          </>
        ) : null}
      </dl>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-black/10 pt-6 dark:border-white/15">
        <Link
          href="/mfa"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          Manage two-factor
        </Link>
        <button
          onClick={() => unenroll("totp")}
          disabled={pending}
          className="rounded-lg border border-black/15 px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          Remove authenticator
        </button>
        <button
          onClick={() => unenroll("sms")}
          disabled={pending}
          className="rounded-lg border border-black/15 px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          Remove SMS
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DashboardScreen />
    </Suspense>
  );
}
