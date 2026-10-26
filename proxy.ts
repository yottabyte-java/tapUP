import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseProjectUrl } from "@/lib/supabase/projectUrl";

function isProtectedPath(pathname: string): boolean {
  return pathname === "/shop"
    || pathname.startsWith("/shop/")
    || pathname === "/me"
    || pathname.startsWith("/me/")
    || pathname === "/pay"
    || pathname.startsWith("/pay/");
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  const connectSources = ["'self'"];
  try {
    const url = new URL(getSupabaseProjectUrl());
    connectSources.push(url.origin);
    connectSources.push(`${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`);
  } catch {
    // WHY: Invalid Supabase configuration must not become executable CSP source text.
  }
  if (process.env.NODE_ENV === "development") {
    connectSources.push("ws:");
  }
  const scriptSources = ["'self'", "'unsafe-inline'"];
  // WHY: React's development error tooling uses eval(); this directive is intentionally absent in production.
  if (process.env.NODE_ENV === "development") {
    scriptSources.push("'unsafe-eval'");
  }

  // WHY: CSP limits executable, connectable, and embeddable content; Supabase is the only external app endpoint.
  // WHY: 'unsafe-inline' is needed for Next.js streamed hydration and Tailwind's generated inline styles.
  const contentSecurityPolicy = [
    "default-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // WHY: Denying all framing prevents this app from being embedded in a clickjacking page.
    "frame-ancestors 'none'",
  ].join("; ");
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  // WHY: Disabling MIME sniffing prevents browsers from treating a response as a different content type.
  response.headers.set("X-Content-Type-Options", "nosniff");

  // WHY: Restrict cross-origin referrers so paths and query values are not disclosed to other sites.
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // WHY: Camera access is needed for barcode scanning but must remain limited to this app's own origin.
  response.headers.set("Permissions-Policy", "camera=(self)");

  return response;
}

function redirectWithCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
): NextResponse {
  const redirectResponse = NextResponse.redirect(new URL(pathname, request.url));
  // WHY: Keep refreshed Supabase session cookies when a role check redirects the request.
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return applySecurityHeaders(redirectResponse);
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const isProtected = isProtectedPath(pathname);
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isProtected) {
    return applySecurityHeaders(response);
  }
  if (!supabaseAnonKey) {
    return applySecurityHeaders(new NextResponse("Authentication is unavailable.", { status: 503 }));
  }

  let supabaseUrl: string;
  try {
    supabaseUrl = getSupabaseProjectUrl();
  } catch {
    return applySecurityHeaders(new NextResponse("Authentication is unavailable.", { status: 503 }));
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // WHY: getUser verifies the session with Supabase instead of trusting client-controlled cookie contents.
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    return applySecurityHeaders(new NextResponse("Authentication is unavailable.", { status: 503 }));
  }
  if (!user) {
    return redirectWithCookies(request, response, "/login");
  }

  // WHY: Authorization uses the stored role, not editable user metadata or a browser-supplied role.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return applySecurityHeaders(new NextResponse("Account authorization is unavailable.", { status: 503 }));
  }
  if (!profile || (profile.role !== "shop_owner" && profile.role !== "customer")) {
    return applySecurityHeaders(new NextResponse("This account is not authorized.", { status: 403 }));
  }

  if (pathname === "/me" || pathname.startsWith("/me/")) {
    if (profile.role !== "customer") {
      return redirectWithCookies(request, response, "/shop/sell");
    }
  } else if (pathname === "/shop" || pathname.startsWith("/shop/")) {
    if (profile.role !== "shop_owner") {
      return redirectWithCookies(request, response, "/me");
    }
  } else if (profile.role !== "customer") {
    return redirectWithCookies(request, response, "/shop/sell");
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    // WHY: Exclude immutable build assets, but apply security headers to application pages and API responses.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
