/**
 * Integration tests for src/app/api/auth/register/route.ts
 *
 * Covers AC-AUTH-01 through AC-AUTH-06.
 *
 * All real I/O (user-store, password hashing, MongoDB) is replaced with
 * mock.module() so no live database is needed.
 *
 * Run with:
 *   npx tsx --test --experimental-test-module-mocks src/app/api/auth/register/route.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { after, mock, before, beforeEach } from "node:test";
import type * as RouteModule from "./route";

const ORIGINAL_TRUST_PROXY = process.env.TRUST_PROXY;

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let _registerResult: { ownerId: string } = { ownerId: "uuid-new-user" };
let _registerError: Error | null = null;

class ConflictErrorMock extends Error {
  constructor(message: string) { super(message); this.name = "ConflictError"; }
}

const mockRegisterUser = mock.fn(async () => {
  if (_registerError) throw _registerError;
  return _registerResult;
});

let route: typeof RouteModule | null = null;

before(async () => {
  process.env.TRUST_PROXY = "true";

  await mock.module("@/lib/user-service", {
    namedExports: {
      registerUser: mockRegisterUser,
      ConflictError: ConflictErrorMock,
    },
  });

  route = await import("./route") as typeof RouteModule;
});

beforeEach(() => {
  mockRegisterUser.mock.resetCalls();
  _registerError = null;
  _registerResult = { ownerId: "uuid-new-user" };
});

after(() => {
  process.env.TRUST_PROXY = ORIGINAL_TRUST_PROXY;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3000";

function makeRequest(body: Record<string, unknown>, ip = "10.0.0.1"): Request {
  return new Request(`${ORIGIN}/api/auth/register`, {
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
// AC-AUTH-01: Registration — happy path
// ---------------------------------------------------------------------------

test("AC-AUTH-01: POST /api/auth/register with valid data returns 201 and ownerId", async () => {
  const uniqueIp = `10.1.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makeRequest(
    { name: "Alice", email: "alice@example.com", password: "Secure1234!" },
    uniqueIp
  ) as never);

  assert.equal(response.status, 201);
  const body = await response.json() as { message: string; ownerId: string };
  assert.ok(typeof body.message === "string" && body.message.length > 0, "message should be a string");
  assert.ok(typeof body.ownerId === "string" && body.ownerId.length > 0, "ownerId should be a string");
});

// ---------------------------------------------------------------------------
// AC-AUTH-02: Registration — duplicate email returns 409
// ---------------------------------------------------------------------------

test("AC-AUTH-02: POST /api/auth/register with duplicate email returns 409", async () => {
  const uniqueIp = `10.2.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  _registerError = new ConflictErrorMock("Email already registered.");
  const response = await route!.POST(makeRequest(
    { name: "Alice", email: "alice@example.com", password: "Secure1234!" },
    uniqueIp
  ) as never);

  assert.equal(response.status, 409);
  const body = await response.json() as { error: string };
  assert.ok(typeof body.error === "string");
});

// ---------------------------------------------------------------------------
// AC-AUTH-03: Registration — short password returns 400
// ---------------------------------------------------------------------------

test("AC-AUTH-03: POST /api/auth/register with password < 8 chars returns 400", async () => {
  const uniqueIp = `10.3.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makeRequest(
    { name: "Alice", email: "alice@example.com", password: "abc" },
    uniqueIp
  ) as never);

  assert.equal(response.status, 400);
  const body = await response.json() as { error: string };
  assert.ok(typeof body.error === "string");
});

test("POST /api/auth/register with password > 1024 chars returns 400", async () => {
  const uniqueIp = `10.35.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makeRequest(
    { name: "Alice", email: "alice@example.com", password: "a".repeat(1025) },
    uniqueIp
  ) as never);

  assert.equal(response.status, 400);
  const body = await response.json() as { error: string };
  assert.match(body.error, /1024/);
});

// ---------------------------------------------------------------------------
// AC-AUTH-04: Registration — common password returns 400
// ---------------------------------------------------------------------------

test("AC-AUTH-04: POST /api/auth/register with common password returns 400", async () => {
  const uniqueIp = `10.4.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makeRequest(
    { name: "Alice", email: "alice@example.com", password: "password" },
    uniqueIp
  ) as never);

  assert.equal(response.status, 400);
  const body = await response.json() as { error: string };
  assert.ok(typeof body.error === "string");
});

// ---------------------------------------------------------------------------
// AC-AUTH-05: Registration — invalid email format returns 400
// ---------------------------------------------------------------------------

test("AC-AUTH-05: POST /api/auth/register with invalid email returns 400", async () => {
  const uniqueIp = `10.5.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makeRequest(
    { name: "Alice", email: "not-an-email", password: "Secure1234!" },
    uniqueIp
  ) as never);

  assert.equal(response.status, 400);
  const body = await response.json() as { error: string };
  assert.ok(typeof body.error === "string");
});

// ---------------------------------------------------------------------------
// AC-AUTH-06: Registration — rate limited (6th request in same window = 429)
// ---------------------------------------------------------------------------

test("AC-AUTH-06: POST /api/auth/register is rate-limited after 5 requests", async () => {
  const uniqueIp = `192.0.2.${Math.floor(Math.random() * 254) + 1}`;
  // Use an IP that hasn't been used in other tests and exhaust the 5-request limit
  for (let i = 0; i < 5; i++) {
    await route!.POST(makeRequest(
      { name: "Alice", email: "alice@example.com", password: "Secure1234!" },
      uniqueIp
    ) as never);
  }

  const throttled = await route!.POST(makeRequest(
    { name: "Alice", email: "alice@example.com", password: "Secure1234!" },
    uniqueIp
  ) as never);

  assert.equal(throttled.status, 429);
});
