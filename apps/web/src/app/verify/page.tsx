import { redirect } from "next/navigation";

import { getPendingFlow } from "@/lib/pratu/session";
import { VerifyForm } from "./form";

export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const pending = await getPendingFlow();
  if (!pending || pending.kind !== "verification") redirect("/login");

  return <VerifyForm address={pending.address} />;
}
