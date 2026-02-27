import { NextRequest, NextResponse } from "next/server";
import { getAllProfiles } from "@/lib/data-store";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const typeStr = searchParams.get("type");
    const enginesStr = searchParams.get("engines");
    const search = searchParams.get("search") ?? undefined;
    const owner = searchParams.get("owner") ?? undefined;
    const drafts = searchParams.get("drafts") === "true";
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");

    const type = typeStr !== null ? parseInt(typeStr, 10) : undefined;
    const engines = enginesStr !== null ? parseInt(enginesStr, 10) : undefined;
    const page = pageStr !== null ? parseInt(pageStr, 10) : undefined;
    const limit = limitStr !== null ? parseInt(limitStr, 10) : undefined;

    if (type !== undefined && isNaN(type)) {
      return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
    }
    if (engines !== undefined && isNaN(engines)) {
      return NextResponse.json({ error: "Invalid engines parameter" }, { status: 400 });
    }
    if (page !== undefined && isNaN(page)) {
      return NextResponse.json({ error: "Invalid page parameter" }, { status: 400 });
    }
    if (limit !== undefined && isNaN(limit)) {
      return NextResponse.json({ error: "Invalid limit parameter" }, { status: 400 });
    }

    const result = await getAllProfiles({
      type,
      engines,
      search,
      owner,
      drafts: drafts || undefined,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch profiles:", error);
    return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
  }
}
