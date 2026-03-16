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

function getSessionOwnerId(session: { ownerId?: string } | null | undefined): string | null {
  if (typeof session?.ownerId !== "string") {
    return null;
  }

  const ownerId = session.ownerId.trim();
  return ownerId ? ownerId : null;
}

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
    const session = await auth();
    const ownerId = getSessionOwnerId(session) ?? undefined;
    const profile = await getProfileById(id, ownerId);
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
    const ownerId = getSessionOwnerId(session);
    if (!session?.user || !ownerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const created = await saveProfile(id, body, ownerId, session.user.name ?? null);
    return NextResponse.json({ success: true }, { status: created ? 201 : 200 });
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
    const ownerId = getSessionOwnerId(session);
    if (!session?.user || !ownerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await deleteProfileById(id, ownerId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
