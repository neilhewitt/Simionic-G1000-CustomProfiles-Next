import { NextRequest, NextResponse } from "next/server";
import { getProfile, upsertProfile, deleteProfile } from "@/lib/data-store";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { profileSchema } from "@/lib/profile-schema";
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    // Server-side schema validation (strips unknown fields)
    const result = profileSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }
    const profile = result.data as Profile;

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

export async function DELETE(
  _request: NextRequest,
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

    const existing = await getProfile(id);
    if (!existing) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    if (existing.Owner?.Id !== session.ownerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const deleted = await deleteProfile(id);
    if (!deleted) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete profile:", error);
    return NextResponse.json({ error: "Failed to delete profile" }, { status: 500 });
  }
}
