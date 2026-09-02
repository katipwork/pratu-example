import Link from "next/link";

import { Card } from "@/components/ui";

/**
 * The tenant's error screen (`ui.error_url`).
 *
 * Some failures leave no flow to go back to — the flow expired, the CSRF cookie
 * did not match, a rate limit fired before anything was created. Pratu sends
 * the browser here with `?code=` naming which it was.
 */
const REASONS: Record<string, string> = {
  flow_expired: "That took too long — please start again.",
  csrf_violation: "Your session could not be verified — please start again.",
  rate_limited: "Too many attempts. Try again in a moment.",
  unknown_schema: "That sign-up form is not available.",
  internal_error: "Something went wrong on our side.",
};

export default async function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <Card title="Something interrupted that">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {(code && REASONS[code]) ?? "Please start again."}
      </p>
      {code ? (
        <p className="mt-3 text-xs text-neutral-500">
          Reference: <code className="font-mono">{code}</code>
        </p>
      ) : null}
      <div className="mt-6">
        <Link
          href="/login"
          className="block w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          Back to sign in
        </Link>
      </div>
    </Card>
  );
}
