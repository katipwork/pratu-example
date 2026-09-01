import Link from "next/link";

import { PratuError } from "@/lib/pratu/client";
import { PRATU_TENANT_URL } from "@/lib/pratu/config";

/** Rendered when a flow could not even be created (server down, bad tenant). */
export function FlowError({ error }: { error: unknown }) {
  const isPratu = error instanceof PratuError;
  const message = isPratu
    ? error.message
    : error instanceof Error
      ? error.message
      : String(error);

  return (
    <div className="w-full max-w-md rounded-2xl border border-red-600/30 bg-red-600/5 p-8">
      <h1 className="text-xl font-semibold">Could not start the flow</h1>
      <p className="mt-3 text-sm text-red-800 dark:text-red-300">{message}</p>
      {isPratu && error.status === 0 ? (
        <div className="mt-4 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
          <p>
            Expected a Pratu server at{" "}
            <code className="rounded bg-black/10 px-1 dark:bg-white/10">
              {PRATU_TENANT_URL}
            </code>
            .
          </p>
          <p>
            Start it with <code>make db-up &amp;&amp; make migrate</code> and{" "}
            <code>make run</code>, then create the tenant via the admin API.
          </p>
        </div>
      ) : null}
      <Link href="/" className="mt-6 inline-block text-sm underline">
        Back to start
      </Link>
    </div>
  );
}
