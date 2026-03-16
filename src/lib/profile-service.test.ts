/**
 * Unit tests for src/lib/profile-service.ts
 *
 * All calls to the data-store are intercepted via mock.module() so that no
 * real MongoDB connection is required.
 *
 * Run with:
 *   npx tsx --test --experimental-test-module-mocks src/lib/profile-service.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mock, before, beforeEach } from "node:test";
import { AircraftType, RangeColour } from "@/types";
import type { Profile } from "@/types";
import type * as ProfileServiceModule from "./profile-service";

// ---------------------------------------------------------------------------
// Shared mock state — tests mutate these before calling service functions
// ---------------------------------------------------------------------------

let _getProfileResult: Profile | null = null;
let _deleteProfileResult = true;
let _upsertProfileCreated = false;

const mockGetProfile = mock.fn(
  async (_id: string): Promise<Profile | null> => _getProfileResult
);
const mockUpsertProfile = mock.fn(
  async (_id: string, _profile: unknown): Promise<boolean> => _upsertProfileCreated
);
const mockDeleteProfile = mock.fn(
  async (_id: string): Promise<boolean> => _deleteProfileResult
);

// Typed handle populated in before()
let service: typeof ProfileServiceModule | null = null;

before(async () => {
  // Register the mock BEFORE importing the module that depends on it
  await mock.module("./data-store", {
    namedExports: {
      getProfile: mockGetProfile,
      upsertProfile: mockUpsertProfile,
      deleteProfile: mockDeleteProfile,
    },
  });
  // Now load the module under test; it will pick up the mocked data-store
  service = await import("./profile-service") as typeof ProfileServiceModule;
});

beforeEach(() => {
  mockGetProfile.mock.resetCalls();
  mockUpsertProfile.mock.resetCalls();
  mockDeleteProfile.mock.resetCalls();
  _getProfileResult = null;
  _deleteProfileResult = true;
  _upsertProfileCreated = false;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";
const INVALID_ID = "not-a-uuid";

function makeRange() {
  return { id: "range-id", colour: RangeColour.None, min: 0, max: 0, allowDecimals: false };
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

function makeValidProfile(ownerId = "owner-1"): Profile {
  return {
    id: VALID_UUID,
    owner: { id: ownerId, name: "Test Owner" },
    lastUpdated: "2024-01-01T00:00:00.000Z",
    name: "Test Profile",
    aircraftType: AircraftType.Piston,
    engines: 1,
    isPublished: false,
    notes: null,
    cylinders: 4,
    fadec: false,
    turbocharged: false,
    constantSpeed: false,
    vacuumPSIRange: { min: 0, max: 10, greenStart: 2, greenEnd: 8 },
    manifoldPressure: makeGauge("Manifold Pressure"),
    cht: makeGauge("CHT"),
    egt: makeGauge("EGT"),
    tit: makeGauge("TIT"),
    load: makeGauge("Load"),
    torque: makeGauge("Torque"),
    ng: makeGauge("NG"),
    itt: makeGauge("ITT"),
    temperaturesInFahrenheit: true,
    rpm: makeGauge("RPM"),
    fuel: makeGauge("Fuel"),
    fuelFlow: makeGauge("Fuel Flow"),
    oilPressure: makeGauge("Oil Pressure"),
    oilTemperature: makeGauge("Oil Temp"),
    displayElevatorTrim: false,
    elevatorTrimTakeOffRange: { min: 0, max: 0 },
    displayRudderTrim: false,
    rudderTrimTakeOffRange: { min: 0, max: 0 },
    displayFlapsIndicator: false,
    flapsRange: {
      markings: ["UP", null, null, null, null, "F"],
      positions: [0, null, null, null, null, 100],
    },
    vSpeeds: { Vs0: 0, Vs1: 0, Vfe: 0, Vno: 0, Vne: 0, Vglide: 0, Vr: 0, Vx: 0, Vy: 0 },
  };
}

// ---------------------------------------------------------------------------
// Error class smoke-tests
// ---------------------------------------------------------------------------

test("NotFoundError has correct name", () => {
  const err = new service!.NotFoundError();
  assert.equal(err.name, "NotFoundError");
  assert.ok(err instanceof Error);
});

test("ForbiddenError has correct name", () => {
  const err = new service!.ForbiddenError();
  assert.equal(err.name, "ForbiddenError");
  assert.ok(err instanceof Error);
});

test("ValidationError has correct name and message", () => {
  const err = new service!.ValidationError("bad input");
  assert.equal(err.name, "ValidationError");
  assert.equal(err.message, "bad input");
  assert.ok(err instanceof Error);
});

// ---------------------------------------------------------------------------
// getProfileById
// ---------------------------------------------------------------------------

test("getProfileById returns a published profile to an anonymous caller", async () => {
  const profile = makeValidProfile();
  profile.isPublished = true;
  _getProfileResult = profile;

  const result = await service!.getProfileById(VALID_UUID);
  assert.deepEqual(result, profile);
  assert.equal(mockGetProfile.mock.calls.length, 1);
  assert.equal(mockGetProfile.mock.calls[0].arguments[0], VALID_UUID);
});

test("getProfileById returns an unpublished profile to its owner", async () => {
  const profile = makeValidProfile("owner-1");
  _getProfileResult = profile;

  const result = await service!.getProfileById(VALID_UUID, "owner-1");
  assert.deepEqual(result, profile);
});

test("getProfileById hides an unpublished profile from non-owners", async () => {
  _getProfileResult = makeValidProfile("owner-1");

  await assert.rejects(
    () => service!.getProfileById(VALID_UUID, "owner-2"),
    (err: unknown) => {
      assert.ok(err instanceof service!.NotFoundError);
      return true;
    }
  );
});

test("getProfileById throws NotFoundError when profile is null", async () => {
  await assert.rejects(
    () => service!.getProfileById(VALID_UUID),
    (err: unknown) => {
      assert.ok(err instanceof service!.NotFoundError);
      return true;
    }
  );
});

test("getProfileById throws ValidationError for an invalid UUID", async () => {
  await assert.rejects(
    () => service!.getProfileById(INVALID_ID),
    (err: unknown) => {
      assert.ok(err instanceof service!.ValidationError);
      return true;
    }
  );
});

test("getProfileById accepts UUID with uppercase hex digits", async () => {
  _getProfileResult = makeValidProfile();
  _getProfileResult.isPublished = true;
  const result = await service!.getProfileById(VALID_UUID.toUpperCase());
  assert.ok(result);
});

// ---------------------------------------------------------------------------
// saveProfile
// ---------------------------------------------------------------------------

test("saveProfile throws ValidationError for an invalid UUID", async () => {
  await assert.rejects(
    () => service!.saveProfile(INVALID_ID, makeValidProfile(), "owner-1", "Owner"),
    (err: unknown) => {
      assert.ok(err instanceof service!.ValidationError);
      return true;
    }
  );
});

test("saveProfile throws ValidationError when profile body fails schema validation", async () => {
  await assert.rejects(
    () => service!.saveProfile(VALID_UUID, { name: "" /* empty name */ }, "owner-1", "Owner"),
    (err: unknown) => {
      assert.ok(err instanceof service!.ValidationError);
      return true;
    }
  );
});

test("saveProfile upserts a new profile when none exists", async () => {
  _upsertProfileCreated = true;

  const created = await service!.saveProfile(VALID_UUID, makeValidProfile("owner-1"), "owner-1", "Owner");

  assert.equal(created, true);
  assert.equal(mockUpsertProfile.mock.calls.length, 1);
});

test("saveProfile upserts when existing profile belongs to the same owner", async () => {
  _getProfileResult = makeValidProfile("owner-1");
  _upsertProfileCreated = false;

  const created = await service!.saveProfile(VALID_UUID, makeValidProfile("owner-1"), "owner-1", "Owner");

  assert.equal(created, false);
  assert.equal(mockUpsertProfile.mock.calls.length, 1);
});

test("saveProfile throws ForbiddenError when existing profile belongs to a different owner", async () => {
  _getProfileResult = makeValidProfile("owner-A");

  await assert.rejects(
    () => service!.saveProfile(VALID_UUID, makeValidProfile(), "owner-B", "B"),
    (err: unknown) => {
      assert.ok(err instanceof service!.ForbiddenError);
      return true;
    }
  );
});

test("saveProfile stamps the caller's owner id and name onto the saved profile", async () => {
  await service!.saveProfile(VALID_UUID, makeValidProfile(), "new-owner", "New Owner");

  const savedProfile = mockUpsertProfile.mock.calls[0].arguments[1] as Profile;
  assert.equal(savedProfile.owner.id, "new-owner");
  assert.equal(savedProfile.owner.name, "New Owner");
});

// ---------------------------------------------------------------------------
// deleteProfileById
// ---------------------------------------------------------------------------

test("deleteProfileById throws ValidationError for an invalid UUID", async () => {
  await assert.rejects(
    () => service!.deleteProfileById(INVALID_ID, "owner-1"),
    (err: unknown) => {
      assert.ok(err instanceof service!.ValidationError);
      return true;
    }
  );
});

test("deleteProfileById throws NotFoundError when profile does not exist", async () => {
  await assert.rejects(
    () => service!.deleteProfileById(VALID_UUID, "owner-1"),
    (err: unknown) => {
      assert.ok(err instanceof service!.NotFoundError);
      return true;
    }
  );
});

test("deleteProfileById throws ForbiddenError when owner does not match", async () => {
  _getProfileResult = makeValidProfile("owner-A");

  await assert.rejects(
    () => service!.deleteProfileById(VALID_UUID, "owner-B"),
    (err: unknown) => {
      assert.ok(err instanceof service!.ForbiddenError);
      return true;
    }
  );
});

test("deleteProfileById calls deleteProfile when owner matches", async () => {
  _getProfileResult = makeValidProfile("owner-1");

  await service!.deleteProfileById(VALID_UUID, "owner-1");

  assert.equal(mockDeleteProfile.mock.calls.length, 1);
});

test("deleteProfileById throws NotFoundError when deleteProfile returns false", async () => {
  _getProfileResult = makeValidProfile("owner-1");
  _deleteProfileResult = false;

  await assert.rejects(
    () => service!.deleteProfileById(VALID_UUID, "owner-1"),
    (err: unknown) => {
      assert.ok(err instanceof service!.NotFoundError);
      return true;
    }
  );
});
