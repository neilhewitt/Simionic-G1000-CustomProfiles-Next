import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/user-store";
import { createConversionToken } from "@/lib/token-store";
import { getEmailService } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      // Zero-disclosure: always return 200
      return NextResponse.json({
        message: "If eligible, a conversion email has been sent.",
      });
    }

    // Zero-disclosure: if a local account already exists, don't send an email
    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json({
        message: "If eligible, a conversion email has been sent.",
      });
    }

    const token = await createConversionToken(email);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const link = `${appUrl}/auth/convert/${token}`;

    const emailService = getEmailService();
    await emailService.sendEmail(
      email,
      "Account Conversion — Simionic G1000 Profile DB",
      `<h2>Account Conversion</h2>
       <p>You requested to convert your Microsoft account to a local account.</p>
       <p>Click the link below to complete the conversion:</p>
       <p><a href="${link}">${link}</a></p>
       <p>This link will expire in 24 hours.</p>
       <p>If you did not request this, you can safely ignore this email.</p>`
    );

    return NextResponse.json({
      message: "If eligible, a conversion email has been sent.",
    });
  } catch (error) {
    console.error("Conversion request error:", error);
    // Zero-disclosure: always return 200
    return NextResponse.json({
      message: "If eligible, a conversion email has been sent.",
    });
  }
}
