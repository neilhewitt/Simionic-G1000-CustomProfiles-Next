import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getProfileById,
  saveProfile,
  deleteProfileById,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "@/lib/profile-service";

function mapErrorToResponse(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error("Unexpected error:", error);
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await getProfileById(id);
    return NextResponse.json(profile);
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    await saveProfile(id, body, session.ownerId ?? "", session.user.name ?? null);
    return NextResponse.json({ success: true });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await deleteProfileById(id, session.ownerId ?? "");
    return NextResponse.json({ success: true });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
