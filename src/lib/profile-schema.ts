import { z } from "zod";

const gaugeRangeSchema = z.object({
  id: z.string().optional(),
  colour: z.number().int().min(0).max(3),
  min: z.number(),
  max: z.number(),
  allowDecimals: z.boolean().optional(),
}).strip();

const gaugeSchema = z.object({
  name: z.string().max(200),
  min: z.number().nullable(),
  max: z.number().nullable(),
  fuelInGallons: z.boolean().nullable().optional(),
  capacityForSingleTank: z.number().nullable().optional(),
  torqueInFootPounds: z.boolean().nullable().optional(),
  maxPower: z.number().nullable().optional(),
  ranges: z.array(gaugeRangeSchema).length(4),
  allowDecimals: z.boolean(),
}).strip();

const ownerInfoSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
}).strip();

const settingRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
}).strip();

const vacuumPSIRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  greenStart: z.number(),
  greenEnd: z.number(),
}).strip();

const flapsRangeSchema = z.object({
  markings: z.array(z.string().nullable()).length(6),
  positions: z.array(z.number().nullable()).length(6),
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
  owner: ownerInfoSchema,
  lastUpdated: z.string(),
  name: z.string().min(1, "Profile name is required.").max(200, "Profile name must be 200 characters or fewer."),
  aircraftType: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  engines: z.union([z.literal(1), z.literal(2)]),
  isPublished: z.boolean(),
  notes: z.string().max(2000, "Notes must be 2000 characters or fewer.").nullable(),

  // Piston only
  cylinders: z.union([z.literal(4), z.literal(6)]),
  fadec: z.boolean(),
  turbocharged: z.boolean(),
  constantSpeed: z.boolean(),
  vacuumPSIRange: vacuumPSIRangeSchema,
  manifoldPressure: gaugeSchema,
  cht: gaugeSchema,
  egt: gaugeSchema,
  tit: gaugeSchema,
  load: gaugeSchema,

  // Turbo only
  torque: gaugeSchema,
  ng: gaugeSchema,

  // Turbo + Jet
  itt: gaugeSchema,

  // Common to all
  temperaturesInFahrenheit: z.boolean(),
  rpm: gaugeSchema,
  fuel: gaugeSchema,
  fuelFlow: gaugeSchema,
  oilPressure: gaugeSchema,
  oilTemperature: gaugeSchema,

  displayElevatorTrim: z.boolean(),
  elevatorTrimTakeOffRange: settingRangeSchema,
  displayRudderTrim: z.boolean(),
  rudderTrimTakeOffRange: settingRangeSchema,
  displayFlapsIndicator: z.boolean(),
  flapsRange: flapsRangeSchema,
  vSpeeds: vspeedsSchema,
}).strip();

export type ValidatedProfile = z.infer<typeof profileSchema>;
