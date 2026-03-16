/**
 * Bidirectional field-name mapping between the camelCase used in TypeScript
 * and the PascalCase stored in MongoDB / expected by the Simionic iPad app.
 *
 * Only profile-level and gauge-level field names are mapped.
 * VSpeeds internal keys (Vs0, Vs1, …) are aviation abbreviations and stay as-is.
 * The top-level `id` field is already lowercase and stays as-is, but Owner.Id
 * preserves the legacy PascalCase used by existing profile documents.
 * Enum *values* are unchanged — only object *keys* are transformed.
 */

import type { profileSchema } from "./profile-schema";
import type { z } from "zod";

// All top-level profile field names (excluding `id` which stays lowercase).
// If a new field is added to profileSchema but not to camelToPascal below,
// TypeScript will produce a compile-time error here.
type ProfileSchemaKeys = Exclude<keyof z.infer<typeof profileSchema>, "id">;

// The mapped type enforces that all Profile field keys are present in camelToPascal.
// The additional `{ [key: string]: string }` index signature is required because
// camelToPascal also maps nested-object keys (e.g. "min", "colour", "ranges") that
// are not top-level Profile fields. TypeScript still enforces presence of each
// ProfileSchemaKeys key despite the index signature.
const camelToPascal: { [K in ProfileSchemaKeys]: string } & { [key: string]: string } = {
  // OwnerInfo
  owner: "Owner",
  lastUpdated: "LastUpdated",
  name: "Name",
  aircraftType: "AircraftType",
  engines: "Engines",
  isPublished: "IsPublished",
  notes: "Notes",

  // Piston
  cylinders: "Cylinders",
  fadec: "FADEC",
  turbocharged: "Turbocharged",
  constantSpeed: "ConstantSpeed",
  vacuumPSIRange: "VacuumPSIRange",
  manifoldPressure: "ManifoldPressure",
  cht: "CHT",
  egt: "EGT",
  tit: "TIT",
  load: "Load",

  // Turbo
  torque: "Torque",
  ng: "NG",

  // Turbo + Jet
  itt: "ITT",

  // Common
  temperaturesInFahrenheit: "TemperaturesInFahrenheit",
  rpm: "RPM",
  fuel: "Fuel",
  fuelFlow: "FuelFlow",
  oilPressure: "OilPressure",
  oilTemperature: "OilTemperature",

  displayElevatorTrim: "DisplayElevatorTrim",
  elevatorTrimTakeOffRange: "ElevatorTrimTakeOffRange",
  displayRudderTrim: "DisplayRudderTrim",
  rudderTrimTakeOffRange: "RudderTrimTakeOffRange",
  displayFlapsIndicator: "DisplayFlapsIndicator",
  flapsRange: "FlapsRange",
  vSpeeds: "VSpeeds",

  // SettingRange / VacuumPSIRange
  min: "Min",
  max: "Max",
  greenStart: "GreenStart",
  greenEnd: "GreenEnd",

  // FlapsRange
  markings: "Markings",
  positions: "Positions",

  // GaugeRange
  colour: "Colour",
  allowDecimals: "AllowDecimals",

  // Gauge
  fuelInGallons: "FuelInGallons",
  capacityForSingleTank: "CapacityForSingleTank",
  torqueInFootPounds: "TorqueInFootPounds",
  maxPower: "MaxPower",
  ranges: "Ranges",
};

// Build the reverse map
const pascalToCamel: Record<string, string> = {};
for (const [camel, pascal] of Object.entries(camelToPascal)) {
  pascalToCamel[pascal] = camel;
}

function transformKeys(
  obj: unknown,
  map: Record<string, string>,
  path: string[] = [],
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => transformKeys(item, map, path));
  if (typeof obj !== "object") return obj;

  const result: Record<string, unknown> = {};
  const parentKey = path.at(-1);

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const newKey =
      parentKey === "owner" && key === "id"
        ? "Id"
        : parentKey === "Owner" && key === "Id"
          ? "id"
          : map[key] ?? key;

    result[newKey] = transformKeys(value, map, [...path, key]);
  }
  return result;
}

/** Convert a PascalCase MongoDB document (or imported JSON) to camelCase. */
export function toCamelCase<T>(doc: unknown): T {
  return transformKeys(doc, pascalToCamel) as T;
}

/** Convert a camelCase profile object to PascalCase for MongoDB storage or export. */
export function toPascalCase<T>(obj: unknown): T {
  return transformKeys(obj, camelToPascal) as T;
}
