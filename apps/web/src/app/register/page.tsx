import Link from "next/link";
import { redirect } from "next/navigation";

import { hasPratuCookies, readFlow } from "@/lib/pratu/server";
import { Button, Card, Field, FlowForm, Messages } from "@/components/ui";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>;
}) {
  const { flow: flowId } = await searchParams;
  if (!flowId) redirect("/self-service/registration/browser");

  const flow = await readFlow(flowId);
  if (!flow) {
    // A flow that merely expired can be replaced. A browser that keeps no
    // cookies never gets a readable one, so sending it back to flow creation
    // would loop forever.
    redirect(
      (await hasPratuCookies())
        ? "/self-service/registration/browser"
        : "/error?code=cookies_blocked",
    );
  }

  const fields = flow.ui?.fields ?? [];
  // `password` is listed beside the schema traits but is a credential, not a
  // trait: it posts as its own top-level field. On a tenant whose
  // `first_factor` excludes "password" the flow omits it entirely (ADR 0007).
  const traitFields = fields.filter((field) => field.type !== "password");
  const wantsPassword = fields.some((field) => field.type === "password");

  return (
    <Card
      title="Create your account"
      subtitle={
        wantsPassword
          ? "Traits below come straight from the tenant's Identity Schema."
          : "No password — we'll text you a one-time code to prove the number."
      }
    >
      <Messages messages={flow.messages} />

      <FlowForm
        action={`/self-service/registration?flow=${flow.id}`}
        csrf={flow.csrf_token}
      >
        {/* The flow decides the method; sending a password to a code-only
            tenant is rejected, and vice versa. */}
        <input
          type="hidden"
          name="method"
          value={wantsPassword ? "password" : "code"}
        />

        {traitFields.map((field) => {
          // Schema traits report JSON types ("string"), so the input type comes
          // from the trait's role instead.
          const name = field.name.toLowerCase();
          const isEmail = name.includes("email");
          const isPhone = name.includes("phone") || name.includes("mobile");
          return (
            <Field
              key={field.name}
              // A form post nests `traits.x` into the traits object for us.
              name={`traits.${field.name}`}
              label={field.title ?? field.name}
              type={isEmail ? "email" : isPhone ? "tel" : "text"}
              required={field.required}
              autoComplete={isEmail ? "email" : isPhone ? "tel" : undefined}
              placeholder={isPhone ? "+66812345678" : undefined}
              hint={
                isPhone
                  ? "International format, including the country code."
                  : undefined
              }
            />
          );
        })}

        {wantsPassword ? (
          <Field
            name="password"
            label="Password"
            type="password"
            required
            autoComplete="new-password"
            // NIST 800-63B: length + breach check only, so no composition hints.
            hint="At least 10 characters. Checked against known breached passwords."
          />
        ) : null}

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
