import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { registerUser, ConflictError } from "@/lib/user-service";
import { checkCommonPassword } from "@/lib/common-passwords";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(ip + ":register", 5, FIFTEEN_MINUTES);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    let body: { name?: unknown; email?: unknown; password?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const { name, email, password } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (name.length > 200) {
      return NextResponse.json({ error: "Name must be 200 characters or fewer." }, { status: 400 });
    }
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }
    const commonPasswordError = checkCommonPassword(password);
    if (commonPasswordError) {
      return NextResponse.json({ error: commonPasswordError }, { status: 400 });
    }

    const result = await registerUser(name, email, password);
    return NextResponse.json(
      { message: "Account created.", ownerId: result.ownerId },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
