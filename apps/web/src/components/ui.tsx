import type { ReactNode } from "react";

import type { FlowMessage } from "@/lib/pratu/types";

/**
 * Presentation only — no "use client" anywhere in this file.
 *
 * Every screen is server-rendered and every form is a real HTML form, so these
 * are plain elements with no handlers. The app works with JavaScript disabled.
 */

export function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/15 dark:bg-neutral-900">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {subtitle}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}

/** Renders whatever a flow carried back from a redirect. */
export function Messages({
  messages,
  extra,
}: {
  messages?: FlowMessage[];
  extra?: { kind: "error" | "ok"; text: string } | null;
}) {
  const notices = [
    ...(extra ? [extra] : []),
    ...(messages ?? []).map((message) => ({
      kind: message.type === "error" ? ("error" as const) : ("ok" as const),
      text: message.details?.length
        ? `${message.text}: ${message.details.join("; ")}`
        : message.text,
    })),
  ];
  if (!notices.length) return null;

  return (
    <div className="mb-4 space-y-2">
      {notices.map((notice, index) => (
        <p
          key={index}
          className={`rounded-lg border px-3 py-2 text-sm ${
            notice.kind === "error"
              ? "border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-300"
              : "border-green-600/30 bg-green-600/10 text-green-800 dark:text-green-300"
          }`}
        >
          {notice.text}
        </p>
      ))}
    </div>
  );
}

export function Field({
  name,
  label,
  type = "text",
  required,
  autoComplete,
  placeholder,
  hint,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:bg-neutral-950 dark:focus:border-white/50"
      />
      {hint ? (
        <span className="mt-1 block text-xs text-neutral-500">{hint}</span>
      ) : null}
    </label>
  );
}

/** A one-time-code input: numeric, with the autofill hint phones look for. */
export function CodeField({ label = "Code" }: { label?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={8}
        required
        autoFocus
        className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-black/40 dark:border-white/20 dark:bg-neutral-950 dark:focus:border-white/50"
      />
    </label>
  );
}

export function Button({
  children,
  variant = "primary",
}: {
  children: ReactNode;
  variant?: "primary" | "ghost";
}) {
  const styles =
    variant === "primary"
      ? "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      : "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";
  return (
    <button
      type="submit"
      className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition ${styles}`}
    >
      {children}
    </button>
  );
}

/**
 * A form that submits straight to Pratu.
 *
 * The browser posts `application/x-www-form-urlencoded`, which Pratu treats as
 * an HTML client by construction: it answers 303 back to the tenant's screen
 * instead of JSON. The flow-scope CSRF token rides along as a hidden field.
 */
export function FlowForm({
  action,
  csrf,
  children,
}: {
  action: string;
  csrf?: string;
  children: ReactNode;
}) {
  return (
    <form method="POST" action={action} className="space-y-4">
      <input type="hidden" name="csrf_token" value={csrf ?? ""} />
      {children}
    </form>
  );
}
