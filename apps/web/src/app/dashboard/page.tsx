import { redirect } from "next/navigation";
import Link from "next/link";

import { logoutAction, unenrollAction } from "@/app/actions";
import { currentUser } from "@/lib/pratu/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ enrolled?: string }>;
}) {
  const { enrolled } = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");

  const { session, identity } = user;

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/15 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Signed in</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Session data straight from <code>GET /sessions/whoami</code>.
          </p>
        </div>
        <form action={logoutAction}>
          <button className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
            Sign out
          </button>
        </form>
      </div>

      {enrolled ? (
        <p className="mt-4 rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
          {enrolled === "totp" ? "Authenticator app" : "SMS"} enrolled.
        </p>
      ) : null}

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="font-medium text-neutral-500">Identity</dt>
        <dd className="font-mono text-xs break-all">{identity.id}</dd>

        <dt className="font-medium text-neutral-500">Assurance</dt>
        <dd>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              session.aal === "aal2"
                ? "bg-green-600/15 text-green-800 dark:text-green-300"
                : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
            }`}
          >
            {session.aal}
          </span>
          <span className="ml-2 text-neutral-500">
            {session.aal === "aal2"
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
                  {address.verified ? (
                    <span className="text-xs text-green-700 dark:text-green-400">
                      verified
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                      unverified
                    </span>
                  )}
                </div>
              ))}
            </dd>
          </>
        ) : null}
      </dl>

      <div className="mt-8 flex flex-wrap gap-3 border-t border-black/10 pt-6 dark:border-white/15">
        <Link
          href="/mfa"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          Manage two-factor
        </Link>

        {/* Removing a factor needs an aal2 session; Pratu answers 403 otherwise. */}
        <form action={unenrollAction}>
          <input type="hidden" name="factor" value="totp" />
          <button className="rounded-lg border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
            Remove authenticator
          </button>
        </form>
        <form action={unenrollAction}>
          <input type="hidden" name="factor" value="sms" />
          <button className="rounded-lg border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
            Remove SMS
          </button>
        </form>
      </div>
    </div>
  );
}
