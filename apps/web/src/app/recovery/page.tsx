import { createRecoveryFlow } from "@/lib/pratu/api";
import { attempt } from "@/lib/attempt";
import { FlowError } from "@/components/flow-error";
import { RecoveryForm } from "./form";

export const dynamic = "force-dynamic";

export default async function RecoveryPage() {
  const flow = await attempt(createRecoveryFlow());
  if (!flow.ok) return <FlowError error={flow.error} />;

  return <RecoveryForm flowId={flow.value.id} />;
}
