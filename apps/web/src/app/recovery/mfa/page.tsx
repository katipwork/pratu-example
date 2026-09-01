import { redirect } from "next/navigation";

import { getPendingFlow } from "@/lib/pratu/session";
import { RecoveryMfaForm } from "./form";

export const dynamic = "force-dynamic";

export default async function RecoveryMfaPage() {
  const pending = await getPendingFlow();
  if (!pending || pending.kind !== "recovery") redirect("/recovery");

  return <RecoveryMfaForm methods={pending.methods ?? []} />;
}
