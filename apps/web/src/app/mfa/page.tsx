import { redirect } from "next/navigation";

import { currentUser } from "@/lib/pratu/session";
import { MfaEnrollForm } from "./form";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return <MfaEnrollForm />;
}
