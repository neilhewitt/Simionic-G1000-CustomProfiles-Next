/**
 * Integration tests for src/app/api/profiles/route.ts  (GET /api/profiles)
 *
 * Covers AC-PROFILE-14 through AC-PROFILE-21.
 *
 * All real I/O (data-store, auth) is replaced with mock.module() so no live
 * database is needed.
 *
 * Run with:
 *   npx tsx --test --experimental-test-module-mocks src/app/api/profiles/route.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mock, before, beforeEach } from "node:test";
import { NextRequest } from "next/server";
import { AircraftType } from "@/types";
import type { ProfileSummary } from "@/types";
import type { PaginatedProfiles } from "@/lib/data-store";
import type * as RouteModule from "./route";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let _session: { user: { name: string }; ownerId: string } | null = null;
let _getAllProfilesResult: PaginatedProfiles = {
  profiles: [],
  total: 0,
  page: 1,
  limit: 20,
};

const mockAuth = mock.fn(async () => _session);
const mockGetAllProfiles = mock.fn(async () => _getAllProfilesResult);

let route: typeof RouteModule | null = null;

before(async () => {
  await mock.module("@/lib/auth", {
    namedExports: { auth: mockAuth },
  });

  await mock.module("@/lib/data-store", {
    namedExports: {
      getAllProfiles: mockGetAllProfiles,
    },
  });

  route = await import("./route") as typeof RouteModule;
});

beforeEach(() => {
  mockAuth.mock.resetCalls();
  mockGetAllProfiles.mock.resetCalls();
  _session = null;
  _getAllProfilesResult = { profiles: [], total: 0, page: 1, limit: 20 };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3000";

function makeSummary(overrides: Partial<ProfileSummary> = {}): ProfileSummary {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    owner: { id: "owner-uuid", name: "Alice" },
    lastUpdated: "2024-01-01T00:00:00.000Z",
    name: "Test Profile",
    aircraftType: AircraftType.Piston,
    engines: 1,
    isPublished: true,
    notes: null,
    ...overrides,
  };
}

function makeGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL(`${ORIGIN}/api/profiles`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

// ---------------------------------------------------------------------------
// AC-PROFILE-14: List profiles — without auth only returns published profiles
// ---------------------------------------------------------------------------

test("AC-PROFILE-14: GET /api/profiles returns only published profiles when unauthenticated", async () => {
  const published = makeSummary({ isPublished: true, name: "Published" });
  _getAllProfilesResult = { profiles: [published], total: 1, page: 1, limit: 20 };

  const response = await route!.GET(makeGetRequest());
  assert.equal(response.status, 200);
  const body = await response.json() as PaginatedProfiles;
  assert.equal(body.profiles.length, 1);
  assert.equal(body.profiles[0].name, "Published");
  // The data-store mock receives the query — no owner/drafts filter applied for unauthenticated
  const call = mockGetAllProfiles.mock.calls[0];
  assert.ok(!call.arguments[0]?.drafts, "drafts should not be set when unauthenticated");
});

// ---------------------------------------------------------------------------
// AC-PROFILE-15: List profiles — owner sees own drafts
// ---------------------------------------------------------------------------

test("AC-PROFILE-15: GET /api/profiles?owner=[ownerId] authenticated as that owner returns own drafts", async () => {
  const draft = makeSummary({ isPublished: false, name: "Draft Profile", id: "draft-id" });
  _session = { user: { name: "Alice" }, ownerId: "owner-uuid" };
  _getAllProfilesResult = { profiles: [draft], total: 1, page: 1, limit: 20 };

  const response = await route!.GET(makeGetRequest({ owner: "owner-uuid", drafts: "true" }));
  assert.equal(response.status, 200);
  const body = await response.json() as PaginatedProfiles;
  assert.equal(body.profiles.length, 1);
  assert.equal(body.profiles[0].isPublished, false);

  // The data-store call should include owner and drafts=true
  const call = mockGetAllProfiles.mock.calls[0];
  assert.equal(call.arguments[0]?.owner, "owner-uuid");
  assert.equal(call.arguments[0]?.drafts, true);
});

test("AC-PROFILE-15: GET /api/profiles?owner=[ownerId] without matching session ignores owner/drafts filter", async () => {
  _session = null; // unauthenticated
  _getAllProfilesResult = { profiles: [], total: 0, page: 1, limit: 20 };

  await route!.GET(makeGetRequest({ owner: "owner-uuid", drafts: "true" }));

  const call = mockGetAllProfiles.mock.calls[0];
  // With no matching session, owner and drafts are stripped
  assert.ok(!call.arguments[0]?.owner, "owner should be stripped when session doesn't match");
  assert.ok(!call.arguments[0]?.drafts, "drafts should be stripped when session doesn't match");
});

// ---------------------------------------------------------------------------
// AC-PROFILE-16: List profiles — filter by aircraft type
// ---------------------------------------------------------------------------

test("AC-PROFILE-16: GET /api/profiles?type=1 passes type=1 to data-store", async () => {
  const turboprop = makeSummary({ aircraftType: AircraftType.Turboprop, name: "King Air" });
  _getAllProfilesResult = { profiles: [turboprop], total: 1, page: 1, limit: 20 };

  const response = await route!.GET(makeGetRequest({ type: "1" }));
  assert.equal(response.status, 200);
  const body = await response.json() as PaginatedProfiles;
  assert.equal(body.profiles[0].aircraftType, AircraftType.Turboprop);

  const call = mockGetAllProfiles.mock.calls[0];
  assert.equal(call.arguments[0]?.type, 1);
});

// ---------------------------------------------------------------------------
// AC-PROFILE-17: List profiles — search by name
// ---------------------------------------------------------------------------

test("AC-PROFILE-17: GET /api/profiles?search=Cessna passes search param to data-store", async () => {
  const cessna = makeSummary({ name: "Cessna 172" });
  _getAllProfilesResult = { profiles: [cessna], total: 1, page: 1, limit: 20 };

  const response = await route!.GET(makeGetRequest({ search: "Cessna" }));
  assert.equal(response.status, 200);

  const call = mockGetAllProfiles.mock.calls[0];
  assert.equal(call.arguments[0]?.search, "Cessna");
});

// ---------------------------------------------------------------------------
// AC-PROFILE-18: List profiles — search by author
// ---------------------------------------------------------------------------

test("AC-PROFILE-18: GET /api/profiles?search=Alice passes search param and returns Alice's profile", async () => {
  const aliceProfile = makeSummary({ name: "Cessna 172", owner: { id: "o1", name: "Alice" } });
  _getAllProfilesResult = { profiles: [aliceProfile], total: 1, page: 1, limit: 20 };

  const response = await route!.GET(makeGetRequest({ search: "Alice" }));
  assert.equal(response.status, 200);
  const body = await response.json() as PaginatedProfiles;
  assert.equal(body.profiles[0].owner.name, "Alice");

  const call = mockGetAllProfiles.mock.calls[0];
  assert.equal(call.arguments[0]?.search, "Alice");
});

// ---------------------------------------------------------------------------
// AC-PROFILE-19: List profiles — multi-term AND search
// ---------------------------------------------------------------------------

test("AC-PROFILE-19: GET /api/profiles?search=Cessna+Alice passes multi-term search to data-store", async () => {
  const match = makeSummary({ name: "Cessna 172", owner: { id: "o1", name: "Alice" } });
  _getAllProfilesResult = { profiles: [match], total: 1, page: 1, limit: 20 };

  const response = await route!.GET(makeGetRequest({ search: "Cessna Alice" }));
  assert.equal(response.status, 200);

  const call = mockGetAllProfiles.mock.calls[0];
  assert.equal(call.arguments[0]?.search, "Cessna Alice");
});

// ---------------------------------------------------------------------------
// AC-PROFILE-20: List profiles — pagination
// ---------------------------------------------------------------------------

test("AC-PROFILE-20: GET /api/profiles?limit=10&page=2 returns correct pagination metadata", async () => {
  // Create 10 profiles for page 2 of 25
  const profiles = Array.from({ length: 10 }, (_, i) =>
    makeSummary({ id: `id-${i}`, name: `Profile ${i + 11}` })
  );
  _getAllProfilesResult = { profiles, total: 25, page: 2, limit: 10 };

  const response = await route!.GET(makeGetRequest({ limit: "10", page: "2" }));
  assert.equal(response.status, 200);
  const body = await response.json() as PaginatedProfiles;
  assert.equal(body.profiles.length, 10);
  assert.equal(body.total, 25);
  assert.equal(body.page, 2);
  assert.equal(body.limit, 10);

  const call = mockGetAllProfiles.mock.calls[0];
  assert.equal(call.arguments[0]?.page, 2);
  assert.equal(call.arguments[0]?.limit, 10);
});

// ---------------------------------------------------------------------------
// AC-PROFILE-21: List profiles — sorted by lastUpdated descending
// ---------------------------------------------------------------------------

test("AC-PROFILE-21: GET /api/profiles returns profiles sorted by lastUpdated descending (as returned by data-store)", async () => {
  const newer = makeSummary({ id: "newer-id", name: "Newer", lastUpdated: "2024-06-01T00:00:00.000Z" });
  const older = makeSummary({ id: "older-id", name: "Older", lastUpdated: "2024-01-01T00:00:00.000Z" });
  // Data-store is responsible for sorting; route passes results through as-is
  _getAllProfilesResult = { profiles: [newer, older], total: 2, page: 1, limit: 20 };

  const response = await route!.GET(makeGetRequest());
  assert.equal(response.status, 200);
  const body = await response.json() as PaginatedProfiles;
  // Verify the route preserves the data-store's sort order
  assert.equal(body.profiles[0].id, "newer-id");
  assert.equal(body.profiles[1].id, "older-id");
});

// ---------------------------------------------------------------------------
// Extra: invalid query parameter returns 400
// ---------------------------------------------------------------------------

test("GET /api/profiles?type=notanumber returns 400", async () => {
  const response = await route!.GET(makeGetRequest({ type: "notanumber" }));
  assert.equal(response.status, 400);
});
