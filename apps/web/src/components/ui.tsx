"use client";

import type { FormEvent, ReactNode } from "react";

import type { FlowMessage } from "@/lib/pratu/types";

/** What a screen is currently telling the user. */
export type Notice = { kind: "error" | "ok"; text: string } | null;

/** Turns the messages a flow carries back from a redirect into a Notice. */
export function noticeFromFlow(messages?: FlowMessage[]): Notice {
  const message = messages?.[0];
  if (!message) return null;
  return {
    kind: message.type === "error" ? "error" : "ok",
    text: message.details?.length
      ? `${message.text}: ${message.details.join("; ")}`
      : message.text,
  };
}

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

export function Alert({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const styles =
    notice.kind === "error"
      ? "border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-300"
      : "border-green-600/30 bg-green-600/10 text-green-800 dark:text-green-300";
  return (
    <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${styles}`}>
      {notice.text}
    </p>
  );
}

export function Field({
  name,
  label,
  type = "text",
  required,
  autoComplete,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
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
        className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-black/40 dark:border-white/20 dark:bg-neutral-950 dark:focus:border-white/50"
      />
    </label>
  );
}

export function Button({
  children,
  pending,
  variant = "primary",
  type = "submit",
  onClick,
}: {
  children: ReactNode;
  pending?: boolean;
  variant?: "primary" | "ghost";
  type?: "submit" | "button";
  onClick?: () => void;
}) {
  const styles =
    variant === "primary"
      ? "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      : "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={pending}
      className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${styles}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

/** Placeholder shown while a flow is being created or re-read. */
export function Loading() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-8 dark:border-white/15 dark:bg-neutral-900">
      <div className="h-6 w-40 animate-pulse rounded bg-black/10 dark:bg-white/10" />
      <div className="mt-6 space-y-3">
        <div className="h-10 animate-pulse rounded bg-black/5 dark:bg-white/5" />
        <div className="h-10 animate-pulse rounded bg-black/5 dark:bg-white/5" />
      </div>
    </div>
  );
}

/** Reads a form's fields without needing controlled inputs. */
export function formValues(event: FormEvent<HTMLFormElement>) {
  const data = new FormData(event.currentTarget);
  return (name: string) => String(data.get(name) ?? "");
}
