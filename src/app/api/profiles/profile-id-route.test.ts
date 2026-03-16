/**
 * Integration tests for src/app/api/profiles/[id]/route.ts
 *
 * Covers AC-PROFILE-01 through AC-PROFILE-13.
 *
 * Note: This file lives alongside profiles/route.test.ts (not inside the [id]
 * directory) because node:test's glob-based file discovery interprets the
 * bracket characters as glob character classes.
 *
 * All real I/O (profile-service, auth) is replaced with mock.module() so no
 * live database is needed.
 *
 * Run with:
 *   npx tsx --test --experimental-test-module-mocks src/app/api/profiles/profile-id-route.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mock, before, beforeEach } from "node:test";
import { NextRequest } from "next/server";
import { AircraftType, RangeColour } from "@/types";
import type { Profile } from "@/types";
import { toCamelCase } from "@/lib/field-mapping";
import type * as RouteModule from "./[id]/route";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let _session: { user: { name: string }; ownerId: string } | null = null;
let _getProfileResult: Profile | null = null;
let _saveProfileError: Error | null = null;
let _deleteProfileError: Error | null = null;

class NotFoundErrorMock extends Error {
  constructor(message = "Not found") { super(message); this.name = "NotFoundError"; }
}

class ForbiddenErrorMock extends Error {
  constructor(message = "Forbidden") { super(message); this.name = "ForbiddenError"; }
}

class ValidationErrorMock extends Error {
  constructor(message: string) { super(message); this.name = "ValidationError"; }
}

const mockAuth = mock.fn(async () => _session);
const mockGetProfileById = mock.fn(async (_id: string): Promise<Profile> => {
  if (!_getProfileResult) throw new NotFoundErrorMock("Profile not found");
  return _getProfileResult;
});
const mockSaveProfile = mock.fn(async () => {
  if (_saveProfileError) throw _saveProfileError;
});
const mockDeleteProfileById = mock.fn(async () => {
  if (_deleteProfileError) throw _deleteProfileError;
});

let route: typeof RouteModule | null = null;

before(async () => {
  await mock.module("@/lib/auth", {
    namedExports: { auth: mockAuth },
  });

  await mock.module("@/lib/profile-service", {
    namedExports: {
      getProfileById: mockGetProfileById,
      saveProfile: mockSaveProfile,
      deleteProfileById: mockDeleteProfileById,
      NotFoundError: NotFoundErrorMock,
      ForbiddenError: ForbiddenErrorMock,
      ValidationError: ValidationErrorMock,
    },
  });

  route = await import("./[id]/route") as typeof RouteModule;
});

beforeEach(() => {
  mockAuth.mock.resetCalls();
  mockGetProfileById.mock.resetCalls();
  mockSaveProfile.mock.resetCalls();
  mockDeleteProfileById.mock.resetCalls();
  _session = null;
  _getProfileResult = null;
  _saveProfileError = null;
  _deleteProfileError = null;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3000";
const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";
const INVALID_ID = "not-a-uuid";

function makeRange() {
  return {
    id: "123e4567-e89b-12d3-a456-426614174001",
    colour: RangeColour.None,
    min: 0,
    max: 0,
    allowDecimals: false,
  };
}

function makeGauge(name = "Test") {
  return {
    name,
    min: 0 as number | null,
    max: 100 as number | null,
    fuelInGallons: null,
    capacityForSingleTank: null,
    torqueInFootPounds: null,
    maxPower: null,
    ranges: [makeRange(), makeRange(), makeRange(), makeRange()],
    allowDecimals: false,
  };
}

function makeSavedProfile(overrides: Partial<Profile> = {}): Profile {
  const base: Profile = {
    id: VALID_UUID,
    owner: { id: "owner-uuid", name: "Alice" },
    lastUpdated: "2024-01-01T00:00:00.000Z",
    name: "Test Profile",
    aircraftType: AircraftType.Piston,
    engines: 1,
    isPublished: true,
    notes: null,
    cylinders: 4,
    fadec: false,
    turbocharged: false,
    constantSpeed: false,
    vacuumPSIRange: { min: 0, max: 10, greenStart: 4.5, greenEnd: 5.5 },
    manifoldPressure: makeGauge("Manifold Pressure"),
    cht: makeGauge("CHT"),
    egt: makeGauge("EGT"),
    tit: makeGauge("TIT"),
    load: makeGauge("Load"),
    torque: makeGauge("Torque"),
    ng: makeGauge("NG"),
    itt: makeGauge("ITT"),
    temperaturesInFahrenheit: false,
    rpm: makeGauge("RPM"),
    fuel: { ...makeGauge("Fuel"), fuelInGallons: true, capacityForSingleTank: 20 },
    fuelFlow: makeGauge("Fuel Flow"),
    oilPressure: makeGauge("Oil Pressure"),
    oilTemperature: makeGauge("Oil Temperature"),
    displayElevatorTrim: false,
    elevatorTrimTakeOffRange: { min: 0, max: 0 },
    displayRudderTrim: false,
    rudderTrimTakeOffRange: { min: 0, max: 0 },
    displayFlapsIndicator: false,
    flapsRange: {
      markings: ["UP", null, null, null, null, "F"],
      positions: [0, null, null, null, null, 100],
    },
    vSpeeds: {
      Vs0: 0, Vs1: 0, Vfe: 0, Vno: 0, Vne: 0, Vglide: 0, Vr: 0, Vx: 0, Vy: 0,
    },
  };
  return { ...base, ...overrides };
}

function makeImportedProfile(): Profile {
  const raw = readFileSync(
    path.join(process.cwd(), "src", "samples", "2b73437f-aed3-4fa1-b1cc-0e21323775b0.json"),
    "utf8"
  );
  return toCamelCase<Profile>(JSON.parse(raw));
}

function makeGetRequest(id: string): NextRequest {
  return new NextRequest(`${ORIGIN}/api/profiles/${id}`);
}

function makePostRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`${ORIGIN}/api/profiles/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`${ORIGIN}/api/profiles/${id}`, {
    method: "DELETE",
    headers: { origin: ORIGIN },
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// AC-PROFILE-07: GET profile — exists
// ---------------------------------------------------------------------------

test("AC-PROFILE-07: GET /api/profiles/[id] returns 200 with profile data", async () => {
  _getProfileResult = makeSavedProfile();
  const response = await route!.GET(makeGetRequest(VALID_UUID), makeParams(VALID_UUID));
  assert.equal(response.status, 200);
  const body = await response.json() as Profile;
  assert.equal(body.id, VALID_UUID);
  assert.equal(body.name, "Test Profile");
});

// ---------------------------------------------------------------------------
// AC-PROFILE-08: GET profile — not found
// ---------------------------------------------------------------------------

test("AC-PROFILE-08: GET /api/profiles/[id] for unknown ID returns 404", async () => {
  _getProfileResult = null; // service will throw NotFoundError
  const response = await route!.GET(makeGetRequest(VALID_UUID), makeParams(VALID_UUID));
  assert.equal(response.status, 404);
});

// ---------------------------------------------------------------------------
// AC-PROFILE-01: Create profile — authenticated
// ---------------------------------------------------------------------------

test("AC-PROFILE-01: POST /api/profiles/[id] by authenticated user returns 200 { success: true }", async () => {
  _session = { user: { name: "Alice" }, ownerId: "owner-uuid" };
  const profile = makeSavedProfile();
  const response = await route!.POST(makePostRequest(VALID_UUID, profile), makeParams(VALID_UUID));
  assert.equal(response.status, 200);
  const body = await response.json() as { success: boolean };
  assert.equal(body.success, true);
  assert.equal(mockSaveProfile.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// AC-PROFILE-02: Create profile — unauthenticated
// ---------------------------------------------------------------------------

test("AC-PROFILE-02: POST /api/profiles/[id] without session returns 401", async () => {
  _session = null;
  const profile = makeSavedProfile();
  const response = await route!.POST(makePostRequest(VALID_UUID, profile), makeParams(VALID_UUID));
  assert.equal(response.status, 401);
  const body = await response.json() as { error: string };
  assert.equal(body.error, "Unauthorized");
});

// ---------------------------------------------------------------------------
// AC-PROFILE-03: Create profile — invalid UUID triggers validation error
// ---------------------------------------------------------------------------

test("AC-PROFILE-03: POST /api/profiles/not-a-uuid returns 400", async () => {
  _session = { user: { name: "Alice" }, ownerId: "owner-uuid" };
  _saveProfileError = new ValidationErrorMock("Invalid profile ID");
  const profile = makeSavedProfile({ id: INVALID_ID as never });
  const response = await route!.POST(makePostRequest(INVALID_ID, profile), makeParams(INVALID_ID));
  assert.equal(response.status, 400);
});

// ---------------------------------------------------------------------------
// AC-PROFILE-04: Create profile — invalid body (empty name)
// ---------------------------------------------------------------------------

test("AC-PROFILE-04: POST /api/profiles/[id] with empty name returns 400", async () => {
  _session = { user: { name: "Alice" }, ownerId: "owner-uuid" };
  _saveProfileError = new ValidationErrorMock("Profile name is required.");
  const profile = makeSavedProfile({ name: "" });
  const response = await route!.POST(makePostRequest(VALID_UUID, profile), makeParams(VALID_UUID));
  assert.equal(response.status, 400);
  const body = await response.json() as { error: string };
  assert.ok(body.error.includes("Profile name"));
});

// ---------------------------------------------------------------------------
// AC-PROFILE-05: Update profile — owner can update
// ---------------------------------------------------------------------------

test("AC-PROFILE-05: POST /api/profiles/[id] by owner succeeds on update", async () => {
  _session = { user: { name: "Alice" }, ownerId: "owner-uuid" };
  const updated = makeSavedProfile({ name: "Updated Profile" });
  const response = await route!.POST(makePostRequest(VALID_UUID, updated), makeParams(VALID_UUID));
  assert.equal(response.status, 200);
  assert.equal(mockSaveProfile.mock.calls.length, 1);
});

test("POST /api/profiles/[id] accepts an imported turboprop payload converted from sample JSON", async () => {
  _session = { user: { name: "Alice" }, ownerId: "owner-uuid" };

  const imported = makeImportedProfile();
  imported.id = VALID_UUID;
  imported.owner = { id: "owner-uuid", name: "Alice" };
  imported.isPublished = false;

  const response = await route!.POST(makePostRequest(VALID_UUID, imported), makeParams(VALID_UUID));

  assert.equal(response.status, 200);
  assert.equal(mockSaveProfile.mock.calls.length, 1);
  assert.deepEqual(mockSaveProfile.mock.calls[0].arguments, [VALID_UUID, imported, "owner-uuid", "Alice"]);
});

// ---------------------------------------------------------------------------
// AC-PROFILE-06: Update profile — non-owner gets 403
// ---------------------------------------------------------------------------

test("AC-PROFILE-06: POST /api/profiles/[id] by non-owner returns 403", async () => {
  _session = { user: { name: "Bob" }, ownerId: "other-owner-uuid" };
  _saveProfileError = new ForbiddenErrorMock("You do not own this profile.");
  const profile = makeSavedProfile();
  const response = await route!.POST(makePostRequest(VALID_UUID, profile), makeParams(VALID_UUID));
  assert.equal(response.status, 403);
});

// ---------------------------------------------------------------------------
// AC-PROFILE-11: Delete profile — owner can delete
// ---------------------------------------------------------------------------

test("AC-PROFILE-11: DELETE /api/profiles/[id] by owner returns 200 { success: true }", async () => {
  _session = { user: { name: "Alice" }, ownerId: "owner-uuid" };
  const response = await route!.DELETE(makeDeleteRequest(VALID_UUID), makeParams(VALID_UUID));
  assert.equal(response.status, 200);
  const body = await response.json() as { success: boolean };
  assert.equal(body.success, true);
  assert.equal(mockDeleteProfileById.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// AC-PROFILE-12: Delete profile — non-owner gets 403
// ---------------------------------------------------------------------------

test("AC-PROFILE-12: DELETE /api/profiles/[id] by non-owner returns 403", async () => {
  _session = { user: { name: "Bob" }, ownerId: "other-owner-uuid" };
  _deleteProfileError = new ForbiddenErrorMock("You do not own this profile.");
  const response = await route!.DELETE(makeDeleteRequest(VALID_UUID), makeParams(VALID_UUID));
  assert.equal(response.status, 403);
});

// ---------------------------------------------------------------------------
// AC-PROFILE-13: Delete profile — not found
// ---------------------------------------------------------------------------

test("AC-PROFILE-13: DELETE /api/profiles/[id] for non-existent profile returns 404", async () => {
  _session = { user: { name: "Alice" }, ownerId: "owner-uuid" };
  _deleteProfileError = new NotFoundErrorMock("Profile not found");
  const response = await route!.DELETE(makeDeleteRequest(VALID_UUID), makeParams(VALID_UUID));
  assert.equal(response.status, 404);
});

// ---------------------------------------------------------------------------
// DELETE without auth returns 401
// ---------------------------------------------------------------------------

test("DELETE /api/profiles/[id] without session returns 401", async () => {
  _session = null;
  const response = await route!.DELETE(makeDeleteRequest(VALID_UUID), makeParams(VALID_UUID));
  assert.equal(response.status, 401);
  const body = await response.json() as { error: string };
  assert.equal(body.error, "Unauthorized");
});
