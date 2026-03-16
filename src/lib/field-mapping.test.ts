import test from "node:test";
import assert from "node:assert/strict";
import { toCamelCase, toPascalCase } from "./field-mapping";

// ---------------------------------------------------------------------------
// toPascalCase
// ---------------------------------------------------------------------------

test("toPascalCase converts top-level profile keys to PascalCase", () => {
  const input = { name: "My Profile", isPublished: true, aircraftType: 0 };
  const result = toPascalCase<Record<string, unknown>>(input);
  assert.equal(result["Name"], "My Profile");
  assert.equal(result["IsPublished"], true);
  assert.equal(result["AircraftType"], 0);
  assert.equal(result["name"], undefined);
});

test("toPascalCase converts nested gauge keys", () => {
  const input = {
    fuelFlow: {
      name: "Fuel Flow",
      allowDecimals: true,
      ranges: [{ colour: 1, min: 0, max: 10, allowDecimals: true }],
    },
  };
  const result = toPascalCase<Record<string, unknown>>(input);
  const ff = result["FuelFlow"] as Record<string, unknown>;
  assert.equal(ff["Name"], "Fuel Flow");
  assert.equal(ff["AllowDecimals"], true);
  const ranges = ff["Ranges"] as Record<string, unknown>[];
  assert.equal(ranges[0]["Colour"], 1);
  assert.equal(ranges[0]["AllowDecimals"], true);
});

test("toPascalCase converts owner.id to Owner.Id without changing top-level id", () => {
  const input = {
    id: "profile-123",
    owner: { id: "owner-456", name: "Alice" },
  };

  const result = toPascalCase<Record<string, unknown>>(input);
  const owner = result["Owner"] as Record<string, unknown>;

  assert.equal(result["id"], "profile-123");
  assert.equal(result["Id"], undefined);
  assert.equal(owner["Id"], "owner-456");
  assert.equal(owner["Name"], "Alice");
  assert.equal(owner["id"], undefined);
});

test("toPascalCase handles null values without throwing", () => {
  const input = { notes: null };
  const result = toPascalCase<Record<string, unknown>>(input);
  assert.equal(result["Notes"], null);
});

test("toPascalCase handles arrays of primitives", () => {
  const input = { markings: ["UP", null, "F"] };
  const result = toPascalCase<Record<string, unknown>>(input);
  assert.deepEqual(result["Markings"], ["UP", null, "F"]);
});

// ---------------------------------------------------------------------------
// toCamelCase
// ---------------------------------------------------------------------------

test("toCamelCase converts top-level PascalCase keys to camelCase", () => {
  const input = { Name: "My Profile", IsPublished: true, AircraftType: 0 };
  const result = toCamelCase<Record<string, unknown>>(input);
  assert.equal(result["name"], "My Profile");
  assert.equal(result["isPublished"], true);
  assert.equal(result["aircraftType"], 0);
  assert.equal(result["Name"], undefined);
});

test("toCamelCase converts nested gauge keys", () => {
  const input = {
    FuelFlow: {
      Name: "Fuel Flow",
      AllowDecimals: true,
      Ranges: [{ Colour: 1, Min: 0, Max: 10, AllowDecimals: false }],
    },
  };
  const result = toCamelCase<Record<string, unknown>>(input);
  const ff = result["fuelFlow"] as Record<string, unknown>;
  assert.equal(ff["name"], "Fuel Flow");
  assert.equal(ff["allowDecimals"], true);
  const ranges = ff["ranges"] as Record<string, unknown>[];
  assert.equal(ranges[0]["colour"], 1);
  assert.equal(ranges[0]["allowDecimals"], false);
});

test("toCamelCase converts Owner.Id to owner.id without changing top-level id", () => {
  const input = {
    id: "profile-123",
    Owner: { Id: "owner-456", Name: "Alice" },
  };

  const result = toCamelCase<Record<string, unknown>>(input);
  const owner = result["owner"] as Record<string, unknown>;

  assert.equal(result["id"], "profile-123");
  assert.equal(owner["id"], "owner-456");
  assert.equal(owner["name"], "Alice");
  assert.equal(owner["Id"], undefined);
});

test("toCamelCase handles null values without throwing", () => {
  const input = { Notes: null };
  const result = toCamelCase<Record<string, unknown>>(input);
  assert.equal(result["notes"], null);
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

test("toCamelCase and toPascalCase are inverse operations for profile fields", () => {
  const original = {
    name: "Round Trip",
    isPublished: false,
    engines: 1,
    notes: null,
  };
  const roundTripped = toCamelCase<Record<string, unknown>>(
    toPascalCase<Record<string, unknown>>(original)
  );
  assert.deepEqual(roundTripped, original);
});

test("toPascalCase passes through keys that have no mapping unchanged", () => {
  const input = { unknownField: "value" };
  const result = toPascalCase<Record<string, unknown>>(input);
  assert.equal(result["unknownField"], "value");
});

test("toCamelCase passes through keys that have no mapping unchanged", () => {
  const input = { UnknownField: "value" };
  const result = toCamelCase<Record<string, unknown>>(input);
  assert.equal(result["UnknownField"], "value");
});
