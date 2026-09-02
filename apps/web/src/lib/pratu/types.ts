/**
 * Wire types for the Pratu public API (v0.4.0).
 * Mirrors api/public.openapi.yaml — keep in sync with the server contract.
 */

export type FlowKind = "registration" | "login" | "recovery" | "verification";

export type FlowState =
  | "choose_method"
  | "mfa_required"
  | "code_required"
  | "second_factor_required"
  | "password_required";

export type MfaMethod = "totp" | "sms";

/**
 * First factors a tenant accepts, from `first_factor` (ADR 0007).
 * A flow advertises its own through `ui.methods`.
 */
export type FirstFactor = "password" | "code";

export interface UiField {
  name: string;
  type: string;
  title?: string;
  required?: boolean;
}

export interface FlowMessage {
  type: "error" | "info" | "success";
  text: string;
  details?: string[];
}

export interface Flow {
  id: string;
  kind: FlowKind;
  expires_at: string;
  state?: FlowState;
  messages?: FlowMessage[];
  /** Browser flows only. API flows never carry CSRF. */
  csrf_token?: string;
  ui?: {
    fields?: UiField[];
    /**
     * What the flow can be continued with: first factors on a login or
     * registration flow at `choose_method`, second factors once held.
     */
    methods?: (MfaMethod | FirstFactor)[];
  };
}

export interface Address {
  id: string;
  channel: "email" | "sms";
  value: string;
  verified: boolean;
  verified_at?: string;
  for_verification?: boolean;
  for_recovery?: boolean;
}

export interface Identity {
  id: string;
  schema_id: string;
  traits: Record<string, unknown>;
  addresses?: Address[];
  created_at?: string;
}

export interface Session {
  id: string;
  identity_id: string;
  /** aal2 means a second factor was proven. */
  aal: "aal1" | "aal2";
  ip?: string;
  user_agent?: string;
  authenticated_at?: string;
  expires_at?: string;
}

export interface VerificationInfo {
  flow_id: string;
  channel: "email" | "sms";
  /** Masked, e.g. "a***@example.com". */
  address: string;
  csrf_token?: string;
  expires_at?: string;
}

export type AuthState =
  | "active"
  | "verification_required"
  | "mfa_enrollment_required"
  | "verified"
  | "recovered";

/** The common success shape of flow completions. */
export interface AuthResult {
  state: AuthState;
  identity?: Identity;
  session?: Session;
  /** API flows only; browser flows set the cookie instead. */
  session_token?: string;
  verification?: VerificationInfo;
}

/** A 403 login response demanding another step. */
export interface HeldLogin {
  state: "verification_required" | "mfa_required";
  verification?: VerificationInfo;
  methods?: MfaMethod[];
}

export interface WhoAmI {
  session: Session;
  identity: Identity;
  /** Cookie-sourced calls only. */
  csrf_token?: string;
}

export interface RecoveryCodeResult {
  state: "set_password" | "second_factor_required";
  methods?: MfaMethod[];
}

export interface TotpEnrollment {
  flow_id: string;
  secret: string;
  /** otpauth:// URL for QR rendering. */
  uri: string;
  csrf_token?: string;
  expires_at?: string;
}

export interface SmsEnrollment {
  flow_id: string;
  /** Masked phone. */
  address: string;
  csrf_token?: string;
  expires_at?: string;
}

export interface SentResult {
  state: "sent";
  address?: string;
}
