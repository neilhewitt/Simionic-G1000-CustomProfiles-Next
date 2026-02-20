import { NextRequest, NextResponse } from "next/server";
import { getConversionToken, markConversionTokenUsed } from "@/lib/token-store";
import { findUserByEmail, createUser } from "@/lib/user-store";
import { hashPassword } from "@/lib/password";
import { getOwnerId } from "@/lib/owner-id";
import { updateProfileOwner } from "@/lib/data-store";

export async function POST(request: NextRequest) {
  try {
    const { token, email, name, password } = await request.json();

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

    // Validate the conversion token
    const conversionToken = await getConversionToken(token);
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

    // Check if a local account already exists for this email
    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Compute the old (legacy) owner ID from the email using PBKDF2-SHA1
    const oldOwnerId = getOwnerId(email);

    // Create the new local account (generates a new UUID-based owner ID)
    const passwordHash = await hashPassword(password);
    const user = await createUser(email, name.trim(), passwordHash);

    // Migrate all profiles from the old owner ID to the new one
    const migratedCount = await updateProfileOwner(oldOwnerId, user.ownerId, user.name);

    // Mark the conversion token as used
    await markConversionTokenUsed(token);

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
