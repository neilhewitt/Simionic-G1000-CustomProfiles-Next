import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, updatePassword } from "@/lib/user-store";
import { verifyResetCode } from "@/lib/token-store";
import { hashPassword } from "@/lib/password";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(ip + ":reset-password", 10, FIFTEEN_MINUTES);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    let body: { email?: string; code?: string; token?: string; password?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const { email, code, token, password } = body;

    // Accept either "token" (new link-based flow) or "code" (legacy) field
    const resetToken = token ?? code;
    if (!email || !resetToken || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });
    }

    const valid = await verifyResetCode(email, resetToken);
    if (!valid) {
      return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });
    }

    const newHash = await hashPassword(password);
    await updatePassword(email, newHash);

    return NextResponse.json({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
