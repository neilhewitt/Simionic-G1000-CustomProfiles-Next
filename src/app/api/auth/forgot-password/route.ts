import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/user-store";
import { createResetCode } from "@/lib/token-store";
import { getEmailService } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(ip + ":forgot-password", 5, FIFTEEN_MINUTES);
    if (!rl.success) {
      // Zero-disclosure: same response shape regardless of rate limit
      return NextResponse.json(
        { message: "If an account exists, a reset link has been sent." },
        { headers: { "Retry-After": "900" } }
      );
    }

    let body: { email?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      // Zero-disclosure: treat malformed request the same as missing email
      return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
    }
    const { email } = body;

    if (!email || typeof email !== "string") {
      // Always return 200 for zero-disclosure
      return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // Zero-disclosure: don't reveal that the account doesn't exist
      return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
    }

    const token = await createResetCode(email);
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      console.warn("APP_URL is not set; reset link will use localhost fallback.");
    }
    const resetLink = `${appUrl ?? "http://localhost:3000"}/auth/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    const emailService = getEmailService();

    await emailService.sendEmail(
      user.email,
      "Password Reset — Simionic G1000 Profile DB",
      `<h2>Password Reset</h2>
       <p>Click the link below to reset your password:</p>
       <p><a href="${resetLink}">${resetLink}</a></p>
       <p>This link will expire in 15 minutes.</p>
       <p>If you did not request this reset, you can safely ignore this email.</p>`
    );

    return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    // Still return 200 for zero-disclosure
    return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
  }
}
