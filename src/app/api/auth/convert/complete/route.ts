import { NextRequest, NextResponse } from "next/server";
import { findConversionToken, markConversionTokenUsed } from "@/lib/token-store";
import { findUserByEmail, createUserIdempotent } from "@/lib/user-store";
import { hashPassword } from "@/lib/password";
import { getOwnerId } from "@/lib/owner-id";
import { updateProfileOwner } from "@/lib/data-store";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

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

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    if (!name.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    // Look up the conversion token regardless of its `used` status so we can
    // handle retries on already-completed conversions.
    const conversionToken = await findConversionToken(token);
    if (!conversionToken) {
      return NextResponse.json(
        { error: "Invalid or expired conversion link." },
        { status: 400 }
      );
    }

    // Verify the email matches the token
    if (conversionToken.email !== email.toLowerCase().trim()) {
      return NextResponse.json(
        { error: "Email address does not match the conversion request." },
        { status: 400 }
      );
    }

    // --- Idempotent retry handling ---
    // If the token was already used in a previous (successful) request, check
    // whether the user account exists and return an appropriate response.
    if (conversionToken.used) {
      const existingUser = await findUserByEmail(email);
      if (existingUser) {
        console.info(
          `Conversion retry: token already used, user exists (email=${email})`
        );
        return NextResponse.json({
          message: "Account already converted.",
        });
      }
      // Token is marked used but no user exists — this should be extremely rare
      // given the ordering (token is marked used last). Log for investigation.
      console.error(
        `Conversion inconsistency: token used but no user found (email=${email})`
      );
      return NextResponse.json(
        { error: "Conversion is in an inconsistent state. Please contact support." },
        { status: 409 }
      );
    }

    // --- Fresh or partially-completed conversion (token not yet marked used) ---

    // Compute the old (legacy) owner ID from the email using PBKDF2-SHA1
    const oldOwnerId = getOwnerId(email);

    // 1. Create the new local account idempotently — handles duplicate-key
    //    errors from retries or races by returning the existing user.
    const passwordHash = await hashPassword(password);
    const { user, created } = await createUserIdempotent(
      email,
      name.trim(),
      passwordHash
    );

    if (created) {
      console.info(
        `Conversion: created user (email=${email}, ownerId=${user.ownerId})`
      );
    } else {
      console.info(
        `Conversion: user already exists, proceeding (email=${email}, ownerId=${user.ownerId})`
      );
    }

    // 2. Migrate profiles — updateMany is naturally idempotent; re-running it
    //    when profiles have already been migrated results in modifiedCount === 0.
    const migratedCount = await updateProfileOwner(
      oldOwnerId,
      user.ownerId,
      user.name
    );

    console.info(
      `Conversion: migrated ${migratedCount} profile(s) (email=${email}, oldOwner=${oldOwnerId}, newOwner=${user.ownerId})`
    );

    // 3. Mark the token used LAST — only after user creation and profile
    //    migration have succeeded. The conditional update is safe for retries:
    //    if modifiedCount is 0 the token was already used (e.g., parallel request).
    const tokenMarked = await markConversionTokenUsed(token);

    if (tokenMarked) {
      console.info(`Conversion: token marked used (email=${email})`);
    } else {
      console.info(
        `Conversion: token was already marked used (email=${email})`
      );
    }

    return NextResponse.json({
      message: "Account converted successfully.",
      profilesMigrated: migratedCount,
    });
  } catch (error) {
    console.error("Conversion complete error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
