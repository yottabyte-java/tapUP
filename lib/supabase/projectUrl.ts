/** Validate the configured Supabase URL without ever including it in diagnostics. */
export function getSupabaseProjectUrl(value = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error("Supabase project URL configuration is missing");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Supabase project URL configuration is invalid");
  }

  const rootMatch = trimmed.match(/^https?:\/\/([^/?#]+)\/?$/i);
  const authority = rootMatch?.[1] ?? "";

  // WHY: supabase-js appends /auth/v1 and /rest/v1; a prefixed URL sends Auth requests to the wrong API path.
  if (
    (url.protocol !== "https:" && url.protocol !== "http:")
    || !rootMatch
    || url.pathname !== "/"
    || url.search
    || url.hash
    || trimmed.includes("?")
    || trimmed.includes("#")
    || url.username
    || url.password
    || authority.includes("@")
  ) {
    throw new Error("Supabase project URL must be an HTTP(S) project root URL");
  }

  return url.origin;
}
