import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { completeConversion, ValidationError, InconsistentStateError } from "@/lib/user-service";
import { checkCommonPassword } from "@/lib/common-passwords";
import { getPasswordLengthError } from "@/lib/password-policy";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(ip + ":convert-complete", 10, FIFTEEN_MINUTES);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    let body: { token?: string; email?: string; name?: string; password?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const { token, email, name, password } = body;

    if (!token || !email || !name || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    const passwordLengthError = getPasswordLengthError(password);
    if (passwordLengthError) {
      return NextResponse.json({ error: passwordLengthError }, { status: 400 });
    }
    const validPassword = password as string;
    const commonPasswordError = checkCommonPassword(validPassword);
    if (commonPasswordError) {
      return NextResponse.json({ error: commonPasswordError }, { status: 400 });
    }

    if (!name.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (name.length > 200) {
      return NextResponse.json({ error: "Name must be 200 characters or fewer." }, { status: 400 });
    }

    const result = await completeConversion(token, email, name, validPassword);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof InconsistentStateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Conversion complete error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
