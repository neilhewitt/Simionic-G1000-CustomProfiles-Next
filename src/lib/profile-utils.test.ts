import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultGauge,
  createDefaultProfile,
  fixUpGauges,
  getAircraftTypeImage,
  getAircraftTypeName,
} from "./profile-utils";
import { AircraftType, RangeColour } from "@/types";

// ---------------------------------------------------------------------------
// createDefaultGauge
// ---------------------------------------------------------------------------

test("createDefaultGauge creates a gauge with the given name, min and max", () => {
  const gauge = createDefaultGauge("RPM", 0, 3000);
  assert.equal(gauge.name, "RPM");
  assert.equal(gauge.min, 0);
  assert.equal(gauge.max, 3000);
});

test("createDefaultGauge creates exactly 4 ranges", () => {
  const gauge = createDefaultGauge("Test");
  assert.equal(gauge.ranges.length, 4);
});

test("createDefaultGauge ranges default to RangeColour.None with zeroed min/max", () => {
  const gauge = createDefaultGauge("Test");
  for (const range of gauge.ranges) {
    assert.equal(range.colour, RangeColour.None);
    assert.equal(range.min, 0);
    assert.equal(range.max, 0);
  }
});

test("createDefaultGauge gives each range a non-empty string id", () => {
  const gauge = createDefaultGauge("Test");
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const range of gauge.ranges) {
    assert.ok(range.id && uuidRegex.test(range.id), `Expected UUID id, got: ${range.id}`);
  }
});

test("createDefaultGauge sets allowDecimals to false by default", () => {
  const gauge = createDefaultGauge("Test");
  assert.equal(gauge.allowDecimals, false);
  for (const range of gauge.ranges) {
    assert.equal(range.allowDecimals, false);
  }
});

test("createDefaultGauge propagates allowDecimals=true to gauge and all ranges", () => {
  const gauge = createDefaultGauge("Test", 0, 100, { allowDecimals: true });
  assert.equal(gauge.allowDecimals, true);
  for (const range of gauge.ranges) {
    assert.equal(range.allowDecimals, true);
  }
});

test("createDefaultGauge optional properties default to null", () => {
  const gauge = createDefaultGauge("Test");
  assert.equal(gauge.fuelInGallons, null);
  assert.equal(gauge.capacityForSingleTank, null);
  assert.equal(gauge.torqueInFootPounds, null);
  assert.equal(gauge.maxPower, null);
});

test("createDefaultGauge passes through optional options correctly", () => {
  const gauge = createDefaultGauge("Fuel", 0, 100, {
    fuelInGallons: true,
    capacityForSingleTank: 30,
    torqueInFootPounds: false,
    maxPower: 200,
  });
  assert.equal(gauge.fuelInGallons, true);
  assert.equal(gauge.capacityForSingleTank, 30);
  assert.equal(gauge.torqueInFootPounds, false);
  assert.equal(gauge.maxPower, 200);
});

test("createDefaultGauge allows null min and max", () => {
  const gauge = createDefaultGauge("NG", null, null);
  assert.equal(gauge.min, null);
  assert.equal(gauge.max, null);
});

// ---------------------------------------------------------------------------
// createDefaultProfile
// ---------------------------------------------------------------------------

test("createDefaultProfile returns a profile with name 'New Profile'", () => {
  const profile = createDefaultProfile();
  assert.equal(profile.name, "New Profile");
});

test("createDefaultProfile has aircraftType Piston", () => {
  const profile = createDefaultProfile();
  assert.equal(profile.aircraftType, AircraftType.Piston);
});

test("createDefaultProfile has id null (unsaved)", () => {
  const profile = createDefaultProfile();
  assert.equal(profile.id, null);
});

test("createDefaultProfile has isPublished false", () => {
  const profile = createDefaultProfile();
  assert.equal(profile.isPublished, false);
});

test("createDefaultProfile has 1 engine", () => {
  const profile = createDefaultProfile();
  assert.equal(profile.engines, 1);
});

test("createDefaultProfile has 4 cylinders", () => {
  const profile = createDefaultProfile();
  assert.equal(profile.cylinders, 4);
});

test("createDefaultProfile has fadec false", () => {
  const profile = createDefaultProfile();
  assert.equal(profile.fadec, false);
});

test("createDefaultProfile manifoldPressure has allowDecimals true", () => {
  const profile = createDefaultProfile();
  assert.equal(profile.manifoldPressure.allowDecimals, true);
});

test("createDefaultProfile fuelFlow has allowDecimals true", () => {
  const profile = createDefaultProfile();
  assert.equal(profile.fuelFlow.allowDecimals, true);
});

test("createDefaultProfile oilPressure has allowDecimals true", () => {
  const profile = createDefaultProfile();
  assert.equal(profile.oilPressure.allowDecimals, true);
});

test("createDefaultProfile all gauges have exactly 4 ranges", () => {
  const profile = createDefaultProfile();
  const gauges = [
    profile.manifoldPressure, profile.cht, profile.egt, profile.tit, profile.load,
    profile.torque, profile.ng, profile.itt, profile.rpm, profile.fuel,
    profile.fuelFlow, profile.oilPressure, profile.oilTemperature,
  ];
  for (const gauge of gauges) {
    assert.equal(gauge.ranges.length, 4, `Gauge "${gauge.name}" should have 4 ranges`);
  }
});

test("createDefaultProfile has valid vSpeeds with all zeroed", () => {
  const profile = createDefaultProfile();
  const { Vs0, Vs1, Vfe, Vno, Vne, Vglide, Vr, Vx, Vy } = profile.vSpeeds;
  assert.equal(Vs0, 0);
  assert.equal(Vs1, 0);
  assert.equal(Vfe, 0);
  assert.equal(Vno, 0);
  assert.equal(Vne, 0);
  assert.equal(Vglide, 0);
  assert.equal(Vr, 0);
  assert.equal(Vx, 0);
  assert.equal(Vy, 0);
});

test("createDefaultProfile has a valid ISO-8601 lastUpdated string", () => {
  const profile = createDefaultProfile();
  assert.ok(!isNaN(Date.parse(profile.lastUpdated)), "lastUpdated should be a valid date string");
});

// ---------------------------------------------------------------------------
// fixUpGauges
// ---------------------------------------------------------------------------

test("fixUpGauges sets allowDecimals=true on manifoldPressure", () => {
  const profile = createDefaultProfile();
  profile.manifoldPressure.allowDecimals = false;
  fixUpGauges(profile);
  assert.equal(profile.manifoldPressure.allowDecimals, true);
});

test("fixUpGauges sets allowDecimals=true on fuelFlow", () => {
  const profile = createDefaultProfile();
  profile.fuelFlow.allowDecimals = false;
  fixUpGauges(profile);
  assert.equal(profile.fuelFlow.allowDecimals, true);
});

test("fixUpGauges sets allowDecimals=true on oilPressure", () => {
  const profile = createDefaultProfile();
  profile.oilPressure.allowDecimals = false;
  fixUpGauges(profile);
  assert.equal(profile.oilPressure.allowDecimals, true);
});

test("fixUpGauges sets allowDecimals=true on all 4 ranges of manifoldPressure", () => {
  const profile = createDefaultProfile();
  for (const range of profile.manifoldPressure.ranges) {
    range.allowDecimals = false;
  }
  fixUpGauges(profile);
  for (const range of profile.manifoldPressure.ranges) {
    assert.equal(range.allowDecimals, true);
  }
});

test("fixUpGauges sets allowDecimals=true on all 4 ranges of fuelFlow", () => {
  const profile = createDefaultProfile();
  for (const range of profile.fuelFlow.ranges) {
    range.allowDecimals = false;
  }
  fixUpGauges(profile);
  for (const range of profile.fuelFlow.ranges) {
    assert.equal(range.allowDecimals, true);
  }
});

test("fixUpGauges sets allowDecimals=true on all 4 ranges of oilPressure", () => {
  const profile = createDefaultProfile();
  for (const range of profile.oilPressure.ranges) {
    range.allowDecimals = false;
  }
  fixUpGauges(profile);
  for (const range of profile.oilPressure.ranges) {
    assert.equal(range.allowDecimals, true);
  }
});

test("fixUpGauges backfills missing range IDs", () => {
  const profile = createDefaultProfile();
  // Remove IDs from CHT ranges
  for (const range of profile.cht.ranges) {
    delete range.id;
  }
  fixUpGauges(profile);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const range of profile.cht.ranges) {
    assert.ok(range.id && uuidRegex.test(range.id), `Expected UUID id after backfill, got: ${range.id}`);
  }
});

test("fixUpGauges preserves existing range IDs", () => {
  const profile = createDefaultProfile();
  const originalIds = profile.cht.ranges.map((r) => r.id);
  fixUpGauges(profile);
  for (let i = 0; i < originalIds.length; i++) {
    assert.equal(profile.cht.ranges[i].id, originalIds[i]);
  }
});

// ---------------------------------------------------------------------------
// getAircraftTypeImage
// ---------------------------------------------------------------------------

test("getAircraftTypeImage returns piston image for Piston", () => {
  assert.equal(getAircraftTypeImage(AircraftType.Piston), "/img/piston.jpg");
});

test("getAircraftTypeImage returns turboprop image for Turboprop", () => {
  assert.equal(getAircraftTypeImage(AircraftType.Turboprop), "/img/turboprop.jpg");
});

test("getAircraftTypeImage returns jet image for Jet", () => {
  assert.equal(getAircraftTypeImage(AircraftType.Jet), "/img/jet.jpg");
});

test("getAircraftTypeImage returns empty string for unknown type", () => {
  assert.equal(getAircraftTypeImage(99 as AircraftType), "");
});

// ---------------------------------------------------------------------------
// getAircraftTypeName
// ---------------------------------------------------------------------------

test("getAircraftTypeName returns 'Piston' for AircraftType.Piston", () => {
  assert.equal(getAircraftTypeName(AircraftType.Piston), "Piston");
});

test("getAircraftTypeName returns 'Turboprop' for AircraftType.Turboprop", () => {
  assert.equal(getAircraftTypeName(AircraftType.Turboprop), "Turboprop");
});

test("getAircraftTypeName returns 'Jet' for AircraftType.Jet", () => {
  assert.equal(getAircraftTypeName(AircraftType.Jet), "Jet");
});

test("getAircraftTypeName returns 'Unknown' for an unknown type", () => {
  assert.equal(getAircraftTypeName(99 as AircraftType), "Unknown");
});
