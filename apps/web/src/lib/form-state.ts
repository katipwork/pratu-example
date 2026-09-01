/**
 * Form state shared by the server actions and the client forms.
 *
 * This lives outside `actions.ts` because a `"use server"` module may only
 * export async functions — a plain object export breaks the build.
 */
export interface FormState {
  error?: string;
  details?: string[];
  notice?: string;
}

export interface TotpEnrollState extends FormState {
  secret?: string;
  /** Data-URL QR encoding the otpauth:// URI. */
  qr?: string;
}

export const emptyState: FormState = {};
