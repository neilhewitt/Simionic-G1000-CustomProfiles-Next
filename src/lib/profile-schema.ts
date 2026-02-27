import { z } from "zod";

const gaugeRangeSchema = z.object({
  id: z.string().optional(),
  Colour: z.number().int().min(0).max(3),
  Min: z.number(),
  Max: z.number(),
  AllowDecimals: z.boolean().optional(),
}).strip();

const gaugeSchema = z.object({
  Name: z.string().max(200),
  Min: z.number().nullable(),
  Max: z.number().nullable(),
  FuelInGallons: z.boolean().nullable().optional(),
  CapacityForSingleTank: z.number().nullable().optional(),
  TorqueInFootPounds: z.boolean().nullable().optional(),
  MaxPower: z.number().nullable().optional(),
  Ranges: z.array(gaugeRangeSchema).length(4),
  AllowDecimals: z.boolean(),
}).strip();

const ownerInfoSchema = z.object({
  Id: z.string().nullable(),
  Name: z.string().nullable(),
}).strip();

const settingRangeSchema = z.object({
  Min: z.number(),
  Max: z.number(),
}).strip();

const vacuumPSIRangeSchema = z.object({
  Min: z.number(),
  Max: z.number(),
  GreenStart: z.number(),
  GreenEnd: z.number(),
}).strip();

const flapsRangeSchema = z.object({
  Markings: z.array(z.string().nullable()).length(6),
  Positions: z.array(z.number().nullable()).length(6),
}).strip();

const vspeedsSchema = z.object({
  Vs0: z.number(),
  Vs1: z.number(),
  Vfe: z.number(),
  Vno: z.number(),
  Vne: z.number(),
  Vglide: z.number(),
  Vr: z.number(),
  Vx: z.number(),
  Vy: z.number(),
}).strip();

export const profileSchema = z.object({
  id: z.string().nullable(),
  Owner: ownerInfoSchema,
  LastUpdated: z.string(),
  Name: z.string().min(1, "Profile name is required.").max(200, "Profile name must be 200 characters or fewer."),
  AircraftType: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  Engines: z.union([z.literal(1), z.literal(2)]),
  IsPublished: z.boolean(),
  Notes: z.string().max(2000, "Notes must be 2000 characters or fewer.").nullable(),

  // Piston only
  Cylinders: z.union([z.literal(4), z.literal(6)]),
  FADEC: z.boolean(),
  Turbocharged: z.boolean(),
  ConstantSpeed: z.boolean(),
  VacuumPSIRange: vacuumPSIRangeSchema,
  ManifoldPressure: gaugeSchema,
  CHT: gaugeSchema,
  EGT: gaugeSchema,
  TIT: gaugeSchema,
  Load: gaugeSchema,

  // Turbo only
  Torque: gaugeSchema,
  NG: gaugeSchema,

  // Turbo + Jet
  ITT: gaugeSchema,

  // Common to all
  TemperaturesInFahrenheit: z.boolean(),
  RPM: gaugeSchema,
  Fuel: gaugeSchema,
  FuelFlow: gaugeSchema,
  OilPressure: gaugeSchema,
  OilTemperature: gaugeSchema,

  DisplayElevatorTrim: z.boolean(),
  ElevatorTrimTakeOffRange: settingRangeSchema,
  DisplayRudderTrim: z.boolean(),
  RudderTrimTakeOffRange: settingRangeSchema,
  DisplayFlapsIndicator: z.boolean(),
  FlapsRange: flapsRangeSchema,
  VSpeeds: vspeedsSchema,
}).strip();

export type ValidatedProfile = z.infer<typeof profileSchema>;
