import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { requestConversion } from "@/lib/user-service";
import { isValidEmail } from "@/lib/email-validator";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ZERO_DISCLOSURE = { message: "If eligible, a conversion email has been sent." };

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(ip + ":convert-request", 5, FIFTEEN_MINUTES);
    if (!rl.success) {
      return NextResponse.json(ZERO_DISCLOSURE, { headers: { "Retry-After": "900" } });
    }

    let body: { email?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json(ZERO_DISCLOSURE);
    }
    const { email } = body;

    if (!isValidEmail(email)) {
      return NextResponse.json(ZERO_DISCLOSURE);
    }

    await requestConversion(email);
    return NextResponse.json(ZERO_DISCLOSURE);
  } catch (error) {
    console.error("Conversion request error:", error);
    return NextResponse.json(ZERO_DISCLOSURE);
  }
}
