/**
 * Unit tests for src/lib/data-store.ts
 *
 * MongoDB access is mocked via mock.module() so these tests can verify query
 * and update shapes without requiring a real database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { before, beforeEach, mock } from "node:test";
import { AircraftType, RangeColour } from "@/types";
import type { Profile } from "@/types";
import type * as DataStoreModule from "./data-store";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

let _findResult: Record<string, unknown>[] = [];
let _countDocumentsResult = 0;
let _updateManyResult = { modifiedCount: 0 };

const mockToArray = mock.fn(async (): Promise<Record<string, unknown>[]> => _findResult);
const mockLimit = mock.fn((_limit: number) => ({ toArray: mockToArray }));
const mockSkip = mock.fn((_skip: number) => ({ limit: mockLimit }));
const mockSort = mock.fn((_sort: Record<string, 1 | -1>) => ({ skip: mockSkip }));
const mockFind = mock.fn((_filter: unknown, _options?: unknown) => ({ sort: mockSort }));
const mockCountDocuments = mock.fn(async (_filter: unknown): Promise<number> => _countDocumentsResult);
const mockUpdateOne = mock.fn(async (_filter: unknown, _update: unknown, _options?: unknown) => ({ acknowledged: true }));
const mockUpdateMany = mock.fn(async (_filter: unknown, _update: unknown, _options?: unknown) => _updateManyResult);
const mockCreateIndex = mock.fn(async (_keys: unknown, _options?: unknown) => "mock-index");
const mockDeleteOne = mock.fn(async (_filter: unknown) => ({ deletedCount: 1 }));
const mockFindOne = mock.fn(async (_filter: unknown, _options?: unknown) => null);

const mockCollection = mock.fn((_name: string) => ({
  createIndex: mockCreateIndex,
  find: mockFind,
  countDocuments: mockCountDocuments,
  findOne: mockFindOne,
  updateOne: mockUpdateOne,
  updateMany: mockUpdateMany,
  deleteOne: mockDeleteOne,
}));

const mockGetDb = mock.fn(async () => ({
  collection: mockCollection,
}));

let store: typeof DataStoreModule | null = null;

before(async () => {
  await mock.module("./mongodb", {
    namedExports: {
      getDb: mockGetDb,
    },
  });

  store = await import("./data-store") as typeof DataStoreModule;
});

beforeEach(() => {
  _findResult = [];
  _countDocumentsResult = 0;
  _updateManyResult = { modifiedCount: 0 };

  mockGetDb.mock.resetCalls();
  mockCollection.mock.resetCalls();
  mockCreateIndex.mock.resetCalls();
  mockFind.mock.resetCalls();
  mockSort.mock.resetCalls();
  mockSkip.mock.resetCalls();
  mockLimit.mock.resetCalls();
  mockToArray.mock.resetCalls();
  mockCountDocuments.mock.resetCalls();
  mockFindOne.mock.resetCalls();
  mockUpdateOne.mock.resetCalls();
  mockUpdateMany.mock.resetCalls();
  mockDeleteOne.mock.resetCalls();
});

function makeRange() {
  return { id: "range-id", colour: RangeColour.None, min: 0, max: 0, allowDecimals: false };
}

function makeGauge(name = "Gauge") {
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

function makeProfile(): Profile {
  return {
    id: VALID_UUID,
    owner: { id: "owner-123", name: "Alice" },
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
    vSpeeds: { Vs0: 40, Vs1: 50, Vfe: 85, Vno: 120, Vne: 140, Vglide: 75, Vr: 55, Vx: 62, Vy: 74 },
  };
}

test("getAllProfiles matches both Owner.Id and Owner.id for draft owner queries", async () => {
  await store!.getAllProfiles({ owner: "owner-123", drafts: true });

  const filter = mockFind.mock.calls[0].arguments[0];
  assert.deepEqual(filter, {
    $and: [
      { IsPublished: false },
      { $or: [{ "Owner.Id": "owner-123" }, { "Owner.id": "owner-123" }] },
    ],
  });
  assert.deepEqual(mockCountDocuments.mock.calls[0].arguments[0], filter);
});

test("upsertProfile writes Owner.Id by replacing the Owner subdocument", async () => {
  await store!.upsertProfile(VALID_UUID, makeProfile());

  const update = mockUpdateOne.mock.calls[0].arguments[1] as {
    $set: Record<string, unknown>;
  };
  const owner = update.$set["Owner"] as Record<string, unknown>;

  assert.equal(update.$set["id"], VALID_UUID);
  assert.equal(owner["Id"], "owner-123");
  assert.equal(owner["Name"], "Alice");
  assert.equal(owner["id"], undefined);
});

test("updateProfileOwner migrates both owner id variants to Owner.Id", async () => {
  _updateManyResult = { modifiedCount: 2 };

  const modifiedCount = await store!.updateProfileOwner("old-owner", "new-owner", "Alice");

  assert.equal(modifiedCount, 2);
  assert.deepEqual(mockUpdateMany.mock.calls[0].arguments[0], {
    $or: [{ "Owner.Id": "old-owner" }, { "Owner.id": "old-owner" }],
  });
  assert.deepEqual(mockUpdateMany.mock.calls[0].arguments[1], {
    $set: { "Owner.Id": "new-owner", "Owner.Name": "Alice" },
    $unset: { "Owner.id": "" },
  });
});