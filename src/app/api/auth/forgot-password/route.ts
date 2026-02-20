import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/user-store";
import { createResetCode } from "@/lib/token-store";
import { getEmailService } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      // Always return 200 for zero-disclosure
      return NextResponse.json({ message: "If an account exists, a reset code has been sent." });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // Zero-disclosure: don't reveal that the account doesn't exist
      return NextResponse.json({ message: "If an account exists, a reset code has been sent." });
    }

    const code = await createResetCode(email);
    const emailService = getEmailService();

    await emailService.sendEmail(
      user.email,
      "Password Reset Code — Simionic G1000 Profile DB",
      `<h2>Password Reset</h2>
       <p>Your password reset code is:</p>
       <h1 style="letter-spacing: 0.3em; font-family: monospace;">${code}</h1>
       <p>This code will expire in 15 minutes.</p>
       <p>If you did not request this reset, you can safely ignore this email.</p>`
    );

    return NextResponse.json({ message: "If an account exists, a reset code has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    // Still return 200 for zero-disclosure
    return NextResponse.json({ message: "If an account exists, a reset code has been sent." });
  }
}
