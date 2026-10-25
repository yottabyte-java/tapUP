"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const roleSchema = z.enum(["shop_owner", "customer"]);

const signupSchema = z.object({
  role: roleSchema,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  shopName: z.string().trim().min(1).max(120).optional(),
}).strict().refine(
  (data) => data.role !== "shop_owner" || Boolean(data.shopName),
  { path: ["shopName"], message: "Enter your shop name." },
);

function logFailure(step: string, error: unknown, emailDomain: string): void {
  const details = error !== null && typeof error === "object"
    ? error as { message?: unknown; code?: unknown; status?: unknown; name?: unknown }
    : {};
  const rawMessage = typeof details.message === "string"
    ? details.message
    : error instanceof Error ? error.message : "Unknown error";
  const status = typeof details.status === "number" ? details.status : undefined;
  const code = typeof details.code === "string" ? details.code : "unknown";
  const errorName = typeof details.name === "string" ? details.name : "unknown";
  const message = rawMessage
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(/\b(password|token|secret|apikey|api_key|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s?]+\?[^\s]*/gi, "[redacted URL]");

  // WHY: Stage, status, and SDK error name identify endpoint/config failures without logging credentials.
  console.error(`[signup] ${step} failed`, { message, code, status, errorName, emailDomain });
}

export async function createAccount(formData: FormData): Promise<never> {
  const parsed = signupSchema.safeParse({
    role: formData.get("role"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    shopName: formData.get("shopName") || undefined,
  });

  if (!parsed.success) {
    const role = roleSchema.safeParse(formData.get("role"));
    redirect(`/signup?step=details&role=${role.success ? role.data : "customer"}&error=invalid-details`);
  }

  const { role, name, email, password, shopName } = parsed.data;
  const emailDomain = email.split("@")[1] ?? "unknown";

  let authClient: Awaited<ReturnType<typeof createClient>>;
  try {
    authClient = await createClient();
  } catch (error) {
    logFailure("Auth client initialization", error, emailDomain);
    redirect(`/signup?step=details&role=${role}&error=unavailable`);
  }

  let signupResult;
  try {
    signupResult = await authClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
  } catch (error) {
    logFailure("Auth user creation", error, emailDomain);
    redirect(`/signup?step=details&role=${role}&error=unavailable`);
  }

  if (signupResult.error || !signupResult.data.user) {
    if (signupResult.error) {
      logFailure("Auth user creation", signupResult.error, emailDomain);
    } else {
      logFailure("Auth user creation", new Error("Supabase returned no user and no error"), emailDomain);
    }
    redirect(`/signup?step=details&role=${role}&error=account`);
  }

  const user = signupResult.data.user;
  const hasEmailIdentity = Array.isArray(user.identities)
    && user.identities.some((identity) => identity.provider === "email" && identity.user_id === user.id);

  // WHY: Supabase documents an empty identities list for an obfuscated existing-confirmed-user
  // response; the SDK has no property that proves this request created the returned user.
  if (!hasEmailIdentity) {
    logFailure("Auth user creation", new Error("Supabase signup response did not prove a new account"), emailDomain);
    redirect(`/signup?step=details&role=${role}&error=account`);
  }

  const userId = user.id;
  let setupSucceeded = false;
  let adminClient: ReturnType<typeof createAdminClient> | undefined;
  let setupStep = "Admin client initialization";
  try {
    adminClient = createAdminClient();
    setupStep = "Profile insert";
    const { error: profileError } = await adminClient.from("profiles").insert({
      id: userId,
      role,
      full_name: name,
    });

    if (profileError) {
      logFailure("Profile insert", profileError, emailDomain);
    } else if (role === "shop_owner") {
      setupStep = "Shop insert";
      const { error: shopError } = await adminClient.from("shops").insert({
        owner_id: userId,
        name: shopName,
      });
      if (shopError) {
        logFailure("Shop insert", shopError, emailDomain);
      } else {
        setupSucceeded = true;
      }
    } else {
      setupSucceeded = true;
    }
  } catch (error) {
    logFailure(setupStep, error, emailDomain);
    setupSucceeded = false;
  }

  if (!setupSucceeded) {
    // WHY: signUp does not prove this exact request owns the Auth user; never delete an
    // ambiguous account. Setup failures are reported without risking another user's account.
    redirect(`/signup?step=details&role=${role}&error=setup`);
  }

  // WHY: Supabase email-confirmation settings determine whether signup creates a session.
  if (signupResult.data.session) redirect(role === "shop_owner" ? "/shop/sell" : "/me");
  redirect(`/signup?status=created&role=${role}`);
}
