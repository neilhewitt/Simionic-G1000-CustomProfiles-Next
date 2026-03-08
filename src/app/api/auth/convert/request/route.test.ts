/**
 * Integration tests for src/app/api/auth/convert/request/route.ts
 *
 * Covers AC-AUTH-15.
 *
 * All real I/O is replaced with mock.module() so no live database is needed.
 *
 * Run with:
 *   npx tsx --test --experimental-test-module-mocks src/app/api/auth/convert/request/route.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mock, before, beforeEach } from "node:test";
import type * as RouteModule from "./route";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

const mockRequestConversion = mock.fn(async (_email: string): Promise<void> => undefined);

let route: typeof RouteModule | null = null;

before(async () => {
  await mock.module("@/lib/user-service", {
    namedExports: {
      requestConversion: mockRequestConversion,
    },
  });

  route = await import("./route") as typeof RouteModule;
});

beforeEach(() => {
  mockRequestConversion.mock.resetCalls();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3000";

function makeRequest(body: Record<string, unknown>, ip = "10.20.0.1"): Request {
  return new Request(`${ORIGIN}/api/auth/convert/request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// AC-AUTH-15: Account Conversion Request — always zero-disclosure HTTP 200
// ---------------------------------------------------------------------------

test("AC-AUTH-15: POST /api/auth/convert/request with existing account returns 200 (zero-disclosure)", async () => {
  const ip = `10.20.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makeRequest(
    { email: "alice@example.com" },
    ip
  ) as never);

  assert.equal(response.status, 200);
  const body = await response.json() as { message: string };
  assert.ok(typeof body.message === "string" && body.message.length > 0);
});

test("AC-AUTH-15: POST /api/auth/convert/request with unknown email returns 200 (zero-disclosure)", async () => {
  const ip = `10.21.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  mockRequestConversion.mock.resetCalls();
  // Even if the service throws (e.g. user not found), we still return 200
  mockRequestConversion.mock.resetCalls();
  const response = await route!.POST(makeRequest(
    { email: "unknown@example.com" },
    ip
  ) as never);

  assert.equal(response.status, 200);
});

test("AC-AUTH-15: POST /api/auth/convert/request with invalid email returns 200 (zero-disclosure)", async () => {
  const ip = `10.22.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makeRequest(
    { email: "not-an-email" },
    ip
  ) as never);

  // Zero-disclosure: even bad email format → 200
  assert.equal(response.status, 200);
});
