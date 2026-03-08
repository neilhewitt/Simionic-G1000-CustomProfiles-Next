/**
 * Integration tests for src/app/api/auth/convert/complete/route.ts
 *
 * Covers AC-AUTH-18 and AC-AUTH-19.
 *
 * All real I/O is replaced with mock.module() so no live database is needed.
 *
 * Run with:
 *   npx tsx --test --experimental-test-module-mocks src/app/api/auth/convert/complete/route.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mock, before, beforeEach } from "node:test";
import type * as RouteModule from "./route";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let _completeConversionResult: { message: string; profilesMigrated: number } = {
  message: "Account converted successfully.",
  profilesMigrated: 3,
};
let _completeConversionError: Error | null = null;

class ValidationErrorMock extends Error {
  constructor(message: string) { super(message); this.name = "ValidationError"; }
}

class InconsistentStateErrorMock extends Error {
  constructor(message: string) { super(message); this.name = "InconsistentStateError"; }
}

const mockCompleteConversion = mock.fn(async () => {
  if (_completeConversionError) throw _completeConversionError;
  return _completeConversionResult;
});

let route: typeof RouteModule | null = null;

before(async () => {
  await mock.module("@/lib/user-service", {
    namedExports: {
      completeConversion: mockCompleteConversion,
      ValidationError: ValidationErrorMock,
      InconsistentStateError: InconsistentStateErrorMock,
    },
  });

  route = await import("./route") as typeof RouteModule;
});

beforeEach(() => {
  mockCompleteConversion.mock.resetCalls();
  _completeConversionError = null;
  _completeConversionResult = {
    message: "Account converted successfully.",
    profilesMigrated: 3,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3000";

function makeRequest(body: Record<string, unknown>, ip = "10.30.0.1"): Request {
  return new Request(`${ORIGIN}/api/auth/convert/complete`, {
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
// AC-AUTH-18: Account Conversion — Complete
// ---------------------------------------------------------------------------

test("AC-AUTH-18: POST /api/auth/convert/complete with valid data returns 200 with profilesMigrated", async () => {
  const ip = `10.30.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makeRequest(
    {
      token: "valid-conv-token",
      email: "ms-user@example.com",
      name: "Alice",
      password: "Secure1234!",
    },
    ip
  ) as never);

  assert.equal(response.status, 200);
  const body = await response.json() as { message: string; profilesMigrated: number };
  assert.ok(typeof body.message === "string");
  assert.ok(typeof body.profilesMigrated === "number");
  assert.equal(body.profilesMigrated, 3);
  assert.equal(mockCompleteConversion.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// AC-AUTH-19: Account Conversion — Idempotent retry
// ---------------------------------------------------------------------------

test("AC-AUTH-19: POST /api/auth/convert/complete with already-converted token returns 200", async () => {
  const ip = `10.31.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  _completeConversionResult = {
    message: "Account already converted.",
    profilesMigrated: 0,
  };

  const response = await route!.POST(makeRequest(
    {
      token: "used-conv-token",
      email: "ms-user@example.com",
      name: "Alice",
      password: "Secure1234!",
    },
    ip
  ) as never);

  assert.equal(response.status, 200);
  const body = await response.json() as { message: string; profilesMigrated: number };
  assert.equal(body.profilesMigrated, 0);
});

// ---------------------------------------------------------------------------
// Extra: invalid token returns 400
// ---------------------------------------------------------------------------

test("POST /api/auth/convert/complete with invalid token returns 400", async () => {
  const ip = `10.32.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  _completeConversionError = new ValidationErrorMock("Invalid or expired conversion token.");

  const response = await route!.POST(makeRequest(
    {
      token: "bad-token",
      email: "ms-user@example.com",
      name: "Alice",
      password: "Secure1234!",
    },
    ip
  ) as never);

  assert.equal(response.status, 400);
});

test("POST /api/auth/convert/complete with missing fields returns 400", async () => {
  const ip = `10.33.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makeRequest(
    { token: "some-token" }, // missing email, name, password
    ip
  ) as never);

  assert.equal(response.status, 400);
});
