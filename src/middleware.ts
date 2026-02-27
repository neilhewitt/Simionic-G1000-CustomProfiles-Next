import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF protection middleware.
 *
 * For mutating requests (POST, PUT, DELETE, PATCH) to /api/ routes,
 * verifies that the Origin header matches the application's own origin.
 *
 * GET/HEAD/OPTIONS requests and NextAuth's own routes (which have their
 * own CSRF protection) are passed through without checks.
 */
export function middleware(request: NextRequest) {
  const method = request.method.toUpperCase();

  // Only check mutating methods
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return NextResponse.next();
  }

  // Skip NextAuth's own routes — they have their own CSRF protection
  if (request.nextUrl.pathname.startsWith("/api/auth/") &&
      request.nextUrl.pathname.includes("[...nextauth]") ||
      request.nextUrl.pathname.match(/^\/api\/auth\/[^/]*nextauth/)) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");
  const expectedOrigin = request.nextUrl.origin;

  if (!origin || origin !== expectedOrigin) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
