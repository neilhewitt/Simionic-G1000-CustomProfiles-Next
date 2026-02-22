import { NextRequest, NextResponse } from "next/server";
import { getProfile, upsertProfile } from "@/lib/data-store";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Profile } from "@/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid profile ID" }, { status: 400 });
    }
    const profile = await getProfile(id);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid profile ID" }, { status: 400 });
    }

    const profile: Profile = await request.json();

    // Server-side input validation
    if (typeof profile.Name !== "string" || !profile.Name.trim()) {
      return NextResponse.json({ error: "Profile name is required." }, { status: 400 });
    }
    if (profile.Name.length > 200) {
      return NextResponse.json({ error: "Profile name must be 200 characters or fewer." }, { status: 400 });
    }
    if (profile.Notes != null && profile.Notes.length > 2000) {
      return NextResponse.json({ error: "Notes must be 2000 characters or fewer." }, { status: 400 });
    }

    // Verify the caller owns the existing profile (if it already exists)
    const existing = await getProfile(id);
    if (existing && existing.Owner?.Id !== session.ownerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Inject owner info from session (always trust the server, not the client)
    profile.Owner = {
      Id: session.ownerId ?? null,
      Name: session.user.name ?? null,
    };

    await upsertProfile(id, profile);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to upsert profile:", error);
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}
