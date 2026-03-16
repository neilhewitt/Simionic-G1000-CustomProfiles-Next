import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AircraftType } from "@/types";
import { toCamelCase } from "./field-mapping";
import { profileSchema } from "./profile-schema";
import { createDefaultProfile } from "./profile-utils";

test("profileSchema accepts imported turboprop profiles with cylinders set to 0", () => {
  const raw = readFileSync(
    path.join(process.cwd(), "src", "samples", "2b73437f-aed3-4fa1-b1cc-0e21323775b0.json"),
    "utf8"
  );

  const importedProfile = toCamelCase(JSON.parse(raw));
  const result = profileSchema.safeParse(importedProfile);

  assert.equal(result.success, true, result.success ? undefined : result.error.issues[0]?.message);
});

test("profileSchema accepts non-piston profiles with cylinders set to 0", () => {
  const profile = createDefaultProfile();
  profile.aircraftType = AircraftType.Jet;
  profile.cylinders = 0;

  const result = profileSchema.safeParse(profile);
  assert.equal(result.success, true, result.success ? undefined : result.error.issues[0]?.message);
});

test("profileSchema rejects piston profiles with cylinders set to 0", () => {
  const profile = createDefaultProfile();
  profile.aircraftType = AircraftType.Piston;
  profile.cylinders = 0;

  const result = profileSchema.safeParse(profile);
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0]?.message, "Piston profiles must have 4 or 6 cylinders.");
});