"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

import type { FormState } from "@/lib/form-state";

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

export function Field({
  name,
  label,
  type = "text",
  required,
  autoComplete,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
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
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:bg-neutral-950 dark:focus:border-white/50"
      />
    </label>
  );
}

/** A one-time-code input: numeric, 6 digits, with the right autofill hint. */
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

export function SubmitButton({
  children,
  variant = "primary",
}: {
  children: ReactNode;
  variant?: "primary" | "ghost";
}) {
  const { pending } = useFormStatus();
  const styles =
    variant === "primary"
      ? "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      : "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${styles}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function Alert({ state }: { state: FormState }) {
  if (state.notice) {
    return (
      <p className="mb-4 rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
        {state.notice}
      </p>
    );
  }
  if (!state.error) return null;
  return (
    <div className="mb-4 rounded-lg border border-red-600/30 bg-red-600/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
      <p>{state.error}</p>
      {state.details?.length ? (
        <ul className="mt-1 list-inside list-disc text-xs opacity-90">
          {state.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
