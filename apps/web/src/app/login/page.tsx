import { createLoginFlow } from "@/lib/pratu/api";
import { attempt } from "@/lib/attempt";
import { FlowError } from "@/components/flow-error";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const { verified } = await searchParams;
  const flow = await attempt(createLoginFlow());
  if (!flow.ok) return <FlowError error={flow.error} />;

  return <LoginForm flowId={flow.value.id} verified={verified === "1"} />;
}
