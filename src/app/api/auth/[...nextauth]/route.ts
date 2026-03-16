import { NextRequest, NextResponse } from "next/server";
import { handlers } from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const GET = handlers.GET;

export async function POST(request: NextRequest) {
	const ip = getClientIp(request);
	const rl = rateLimit(ip + ":sign-in", 10, FIFTEEN_MINUTES);
	if (!rl.success) {
		return NextResponse.json(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "900" } }
		);
	}

	return handlers.POST(request);
}
