import { createRegistrationFlow } from "@/lib/pratu/api";
import { attempt } from "@/lib/attempt";
import { FlowError } from "@/components/flow-error";
import { RegisterForm } from "./form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // The flow pins an Identity Schema version and tells us which traits to ask
  // for, so the form never hardcodes a tenant's field list.
  const flow = await attempt(createRegistrationFlow());
  if (!flow.ok) return <FlowError error={flow.error} />;

  return (
    <RegisterForm flowId={flow.value.id} fields={flow.value.ui?.fields ?? []} />
  );
}
