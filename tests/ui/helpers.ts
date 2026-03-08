/**
 * Shared helpers and mock data for Playwright UI tests.
 *
 * Usage:
 *   import { mockUnauthenticated, mockAuthenticated, SAMPLE_PROFILES } from "./helpers";
 */
import type { Page, Route } from "@playwright/test";
import { AircraftType } from "../../src/types";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

export const OWNER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
export const OTHER_OWNER_ID = "ffffffff-0000-1111-2222-333333333333";
export const PROFILE_ID = "11111111-2222-3333-4444-555555555555";
export const OTHER_PROFILE_ID = "66666666-7777-8888-9999-aaaaaaaaaaaa";

function makeRange() {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    colour: 0, // None
    min: 0,
    max: 0,
    allowDecimals: false,
  };
}

function makeGauge(name: string) {
  return {
    name,
    min: 0,
    max: 100,
    fuelInGallons: null,
    capacityForSingleTank: null,
    torqueInFootPounds: null,
    maxPower: null,
    ranges: [makeRange(), makeRange(), makeRange(), makeRange()],
    allowDecimals: false,
  };
}

export const SAMPLE_PROFILE = {
  id: PROFILE_ID,
  owner: { id: OWNER_ID, name: "Alice" },
  lastUpdated: "2024-06-01T12:00:00.000Z",
  name: "Cessna 172 Profile",
  aircraftType: AircraftType.Piston,
  engines: 1,
  isPublished: true,
  notes: "A sample profile for the Cessna 172.",
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
  vSpeeds: { Vs0: 0, Vs1: 0, Vfe: 0, Vno: 0, Vne: 0, Vglide: 0, Vr: 0, Vx: 0, Vy: 0 },
};

export const SAMPLE_SUMMARY = {
  id: PROFILE_ID,
  owner: { id: OWNER_ID, name: "Alice" },
  lastUpdated: "2024-06-01T12:00:00.000Z",
  name: "Cessna 172 Profile",
  aircraftType: AircraftType.Piston,
  engines: 1,
  isPublished: true,
  notes: "A sample profile for the Cessna 172.",
};

export const TURBOPROP_SUMMARY = {
  id: OTHER_PROFILE_ID,
  owner: { id: OTHER_OWNER_ID, name: "Bob" },
  lastUpdated: "2024-05-01T12:00:00.000Z",
  name: "King Air 350",
  aircraftType: AircraftType.Turboprop,
  engines: 2,
  isPublished: true,
  notes: "Turboprop profile.",
};

// ---------------------------------------------------------------------------
// Session mocks
// ---------------------------------------------------------------------------

/**
 * Mock an unauthenticated session (empty response from NextAuth).
 */
export async function mockUnauthenticated(page: Page) {
  await page.route("**/api/auth/session", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

/**
 * Mock an authenticated session for the given user.
 */
export async function mockAuthenticated(
  page: Page,
  user = { name: "Alice", email: "alice@example.com", ownerId: OWNER_ID }
) {
  await page.route("**/api/auth/session", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { name: user.name, email: user.email, image: null },
        expires: "2099-01-01T00:00:00.000Z",
        ownerId: user.ownerId,
      }),
    });
  });
}

/**
 * Mock GET /api/profiles to return a paged list.
 */
export async function mockProfileList(
  page: Page,
  profiles: unknown[] = [SAMPLE_SUMMARY, TURBOPROP_SUMMARY]
) {
  await page.route("**/api/profiles?**", async (route: Route) => {
    const url = new URL(route.request().url());
    let filtered = profiles as typeof SAMPLE_SUMMARY[];

    // Apply basic type filtering so the filter AC tests work
    const type = url.searchParams.get("type");
    if (type !== null) {
      filtered = filtered.filter((p) => p.aircraftType === parseInt(type, 10));
    }

    // Apply basic search filtering
    const search = url.searchParams.get("search");
    if (search) {
      const terms = search.trim().split(/[\s,]+/).filter(Boolean);
      filtered = filtered.filter((p) =>
        terms.every(
          (term) =>
            p.name.toLowerCase().includes(term.toLowerCase()) ||
            (p.owner.name ?? "").toLowerCase().includes(term.toLowerCase())
        )
      );
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ profiles: filtered, total: filtered.length, page: 1, limit: 20 }),
    });
  });
}

/**
 * Mock GET /api/profiles/[id] to return a specific profile.
 */
export async function mockProfileById(
  page: Page,
  profile: unknown = SAMPLE_PROFILE,
  id: string = PROFILE_ID
) {
  await page.route(`**/api/profiles/${id}`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(profile),
    });
  });
}
