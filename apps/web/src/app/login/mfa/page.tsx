import { redirect } from "next/navigation";

import { getPendingFlow } from "@/lib/pratu/session";
import { MfaForm } from "./form";

export const dynamic = "force-dynamic";

export default async function LoginMfaPage() {
  const pending = await getPendingFlow();
  if (!pending || pending.kind !== "login-mfa") redirect("/login");

  return <MfaForm methods={pending.methods ?? []} />;
}
