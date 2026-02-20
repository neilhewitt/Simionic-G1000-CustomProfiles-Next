import { NextRequest, NextResponse } from "next/server";
import { getConversionToken } from "@/lib/token-store";

/**
 * GET /api/auth/convert/check?token=xxx
 * Returns 200 if the token is valid, 404 otherwise.
 * Used by the conversion completion page to verify the token before showing the form.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token required." }, { status: 400 });
  }

  const conversionToken = await getConversionToken(token);
  if (!conversionToken) {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 404 });
  }

  return NextResponse.json({ valid: true });
}
