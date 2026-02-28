import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware: nonce-based CSP + CSRF protection.
 *
 * Generates a cryptographically random nonce on every request and sets the
 * Content-Security-Policy response header using it, so that 'unsafe-inline'
 * is not required for scripts. The nonce is also forwarded as an x-nonce
 * request header so that server components (e.g. layout.tsx) can read it.
 *
 * For mutating requests (POST, PUT, DELETE, PATCH) to /api/ routes,
 * verifies that the Origin header matches the application's own origin.
 *
 * GET/HEAD/OPTIONS requests are passed through without the CSRF check.
 * NextAuth's own POST endpoints already include their own CSRF protection
 * and work correctly with the Origin header check applied here.
 */
export function middleware(request: NextRequest) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(Array.from(bytes).map((b) => String.fromCharCode(b)).join(""));

  const cspValue = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "font-src 'self' https://cdn.jsdelivr.net",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  // CSRF check for mutating API requests
  const method = request.method.toUpperCase();
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    const origin = request.headers.get("origin");
    const expectedOrigin = request.nextUrl.origin;

    if (!origin || origin !== expectedOrigin) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }
  }

  // Forward nonce and CSP to server components via request headers.
  // Setting content-security-policy on the request allows Next.js to
  // automatically extract the nonce for its own internal script tags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", cspValue);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", cspValue);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
