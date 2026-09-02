"use client";

import Link from "next/link";

import { useSession } from "@/lib/pratu/use-session";

const flows = [
  {
    href: "/register",
    title: "Register",
    body: "Schema-driven traits, then verify the address before the first session.",
  },
  {
    href: "/login",
    title: "Login",
    body: "Password login that branches into verification or a second factor.",
  },
  {
    href: "/recovery",
    title: "Recovery",
    body: "Address → code → second factor → new password. Anti-enumeration throughout.",
  },
  {
    href: "/mfa",
    title: "Two-factor",
    body: "Enrol TOTP with a QR code, or a phone as an SMS second factor.",
  },
];

export default function Home() {
  const { session } = useSession();

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">
        Pratu flows in Next.js
      </h1>
      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
        Every self-service flow of{" "}
        <a
          href="https://github.com/katipwork/pratu"
          className="underline"
          target="_blank"
          rel="noreferrer"
        >
          Pratu v0.3.1
        </a>
        , driven from the browser with cookies and CSRF — the app and the auth
        API share one origin.
      </p>

      {session ? (
        <p className="mt-6 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm">
          Signed in as{" "}
          <strong>
            {String(Object.values(session.identity.traits)[0] ?? "—")}
          </strong>{" "}
          ({session.session.aal}) ·{" "}
          <Link href="/dashboard" className="underline">
            Dashboard
          </Link>
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {flows.map((flow) => (
          <Link
            key={flow.href}
            href={flow.href}
            className="rounded-xl border border-black/10 bg-white p-5 transition hover:border-black/30 hover:shadow-sm dark:border-white/15 dark:bg-neutral-900 dark:hover:border-white/40"
          >
            <h2 className="font-medium">{flow.title}</h2>
            <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">
              {flow.body}
            </p>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-sm text-neutral-500">
        Mobile OTP login is the SMS branch of the login flow — see{" "}
        <code className="rounded bg-black/5 px-1 text-xs dark:bg-white/10">
          docs/flows.md
        </code>
        .
      </p>
    </div>
  );
}
