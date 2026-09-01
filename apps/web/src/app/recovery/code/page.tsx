import { redirect } from "next/navigation";

import { getPendingFlow } from "@/lib/pratu/session";
import { RecoveryCodeForm } from "./form";

export const dynamic = "force-dynamic";

export default async function RecoveryCodePage() {
  const pending = await getPendingFlow();
  if (!pending || pending.kind !== "recovery") redirect("/recovery");

  return <RecoveryCodeForm address={pending.address} />;
}
