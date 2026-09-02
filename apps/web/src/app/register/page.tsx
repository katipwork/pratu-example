import Link from "next/link";
import { redirect } from "next/navigation";

import { readFlow } from "@/lib/pratu/server";
import { Button, Card, Field, FlowForm, Messages } from "@/components/ui";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>;
}) {
  const { flow: flowId } = await searchParams;
  if (!flowId) redirect("/self-service/registration/browser");

  const flow = await readFlow(flowId);
  if (!flow) redirect("/self-service/registration/browser");

  // `password` is listed beside the schema traits but is a credential, not a
  // trait: it posts as its own top-level field.
  const traitFields = (flow.ui?.fields ?? []).filter(
    (field) => field.type !== "password",
  );

  return (
    <Card
      title="Create your account"
      subtitle="Traits below come straight from the tenant's Identity Schema."
    >
      <Messages messages={flow.messages} />

      <FlowForm
        action={`/self-service/registration?flow=${flow.id}`}
        csrf={flow.csrf_token}
      >
        <input type="hidden" name="method" value="password" />

        {traitFields.map((field) => {
          // Schema traits report JSON types ("string"), so the input type comes
          // from the trait's role instead.
          const isEmail = field.name.toLowerCase().includes("email");
          return (
            <Field
              key={field.name}
              // A form post nests `traits.x` into the traits object for us.
              name={`traits.${field.name}`}
              label={field.title ?? field.name}
              type={isEmail ? "email" : "text"}
              required={field.required}
              autoComplete={isEmail ? "email" : undefined}
            />
          );
        })}

        <Field
          name="password"
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          // NIST 800-63B: length + breach check only, so no composition hints.
          hint="At least 10 characters. Checked against known breached passwords."
        />
        <Button>Create account</Button>
      </FlowForm>

      <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
