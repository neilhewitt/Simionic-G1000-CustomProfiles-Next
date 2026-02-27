import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF protection middleware.
 *
 * For mutating requests (POST, PUT, DELETE, PATCH) to /api/ routes,
 * verifies that the Origin header matches the application's own origin.
 *
 * GET/HEAD/OPTIONS requests are passed through without checks.
 * NextAuth's own POST endpoints already include their own CSRF protection
 * and work correctly with the Origin header check applied here.
 */
export function middleware(request: NextRequest) {
  const method = request.method.toUpperCase();

  // Only check mutating methods
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
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
