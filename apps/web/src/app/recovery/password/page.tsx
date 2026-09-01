import { redirect } from "next/navigation";

import { getPendingFlow } from "@/lib/pratu/session";
import { RecoveryPasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default async function RecoveryPasswordPage() {
  const pending = await getPendingFlow();
  if (!pending || pending.kind !== "recovery") redirect("/recovery");

  return <RecoveryPasswordForm />;
}
