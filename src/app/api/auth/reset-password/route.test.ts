/**
 * Integration tests for src/app/api/auth/reset-password/route.ts
 *
 * Covers AC-AUTH-12 through AC-AUTH-14.
 *
 * All real I/O is replaced with mock.module() so no live database is needed.
 *
 * Run with:
 *   npx tsx --test --experimental-test-module-mocks src/app/api/auth/reset-password/route.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mock, before, beforeEach } from "node:test";
import type * as RouteModule from "./route";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let _resetPasswordError: Error | null = null;

class ValidationErrorMock extends Error {
  constructor(message: string) { super(message); this.name = "ValidationError"; }
}

const mockResetPassword = mock.fn(async () => {
  if (_resetPasswordError) throw _resetPasswordError;
});

let route: typeof RouteModule | null = null;

before(async () => {
  await mock.module("@/lib/user-service", {
    namedExports: {
      resetPassword: mockResetPassword,
      ValidationError: ValidationErrorMock,
    },
  });

  route = await import("./route") as typeof RouteModule;
});

beforeEach(() => {
  mockResetPassword.mock.resetCalls();
  _resetPasswordError = null;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3000";

function makeRequest(body: Record<string, unknown>, ip = "10.10.0.1"): Request {
  return new Request(`${ORIGIN}/api/auth/reset-password`, {
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
// AC-AUTH-12: Password Reset — Complete with valid token
// ---------------------------------------------------------------------------

test("AC-AUTH-12: POST /api/auth/reset-password with valid token returns 200", async () => {
  const ip = `10.10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makeRequest(
    { email: "alice@example.com", token: "valid-token-abc", password: "NewSecure99!" },
    ip
  ) as never);

  assert.equal(response.status, 200);
  const body = await response.json() as { message: string };
  assert.ok(typeof body.message === "string");
  assert.equal(mockResetPassword.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// AC-AUTH-13: Password Reset — Invalid token returns 400
// ---------------------------------------------------------------------------

test("AC-AUTH-13: POST /api/auth/reset-password with invalid token returns 400", async () => {
  const ip = `10.11.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  _resetPasswordError = new ValidationErrorMock("Invalid or expired reset token.");
  const response = await route!.POST(makeRequest(
    { email: "alice@example.com", token: "bad-token", password: "NewSecure99!" },
    ip
  ) as never);

  assert.equal(response.status, 400);
  const body = await response.json() as { error: string };
  assert.ok(typeof body.error === "string");
});

// ---------------------------------------------------------------------------
// AC-AUTH-14: Password Reset — Token used twice returns 400
// ---------------------------------------------------------------------------

test("AC-AUTH-14: POST /api/auth/reset-password with already-used token returns 400", async () => {
  const ip = `10.12.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  _resetPasswordError = new ValidationErrorMock("Token has already been used.");
  const response = await route!.POST(makeRequest(
    { email: "alice@example.com", token: "used-token", password: "NewSecure99!" },
    ip
  ) as never);

  assert.equal(response.status, 400);
  const body = await response.json() as { error: string };
  assert.ok(typeof body.error === "string");
});

// ---------------------------------------------------------------------------
// Extra: missing required fields returns 400
// ---------------------------------------------------------------------------

test("POST /api/auth/reset-password with missing fields returns 400", async () => {
  const ip = `10.13.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makeRequest(
    { email: "alice@example.com" }, // missing token and password
    ip
  ) as never);

  assert.equal(response.status, 400);
});
