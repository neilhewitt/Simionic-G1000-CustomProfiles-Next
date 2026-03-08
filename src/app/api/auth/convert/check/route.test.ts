/**
 * Integration tests for src/app/api/auth/convert/check/route.ts
 *
 * Covers AC-AUTH-16 and AC-AUTH-17.
 *
 * All real I/O is replaced with mock.module() so no live database is needed.
 *
 * Run with:
 *   npx tsx --test --experimental-test-module-mocks src/app/api/auth/convert/check/route.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mock, before, beforeEach } from "node:test";
import { NextRequest } from "next/server";
import type * as RouteModule from "./route";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let _getConversionTokenResult: { email: string; used: boolean; expiresAt: Date } | null = null;

const mockGetConversionToken = mock.fn(
  async (_token: string) => _getConversionTokenResult
);

let route: typeof RouteModule | null = null;

before(async () => {
  await mock.module("@/lib/token-store", {
    namedExports: {
      getConversionToken: mockGetConversionToken,
    },
  });

  route = await import("./route") as typeof RouteModule;
});

beforeEach(() => {
  mockGetConversionToken.mock.resetCalls();
  _getConversionTokenResult = null;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(token: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/auth/convert/check?token=${encodeURIComponent(token)}`
  );
}

// ---------------------------------------------------------------------------
// AC-AUTH-16: Convert Check — valid token returns 200 { valid: true }
// ---------------------------------------------------------------------------

test("AC-AUTH-16: GET /api/auth/convert/check with valid token returns 200 { valid: true }", async () => {
  _getConversionTokenResult = {
    email: "ms-user@example.com",
    used: false,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };

  const response = await route!.GET(makeRequest("valid-conv-token"));

  assert.equal(response.status, 200);
  const body = await response.json() as { valid: boolean };
  assert.equal(body.valid, true);
});

// ---------------------------------------------------------------------------
// AC-AUTH-17: Convert Check — invalid/expired token returns 404
// ---------------------------------------------------------------------------

test("AC-AUTH-17: GET /api/auth/convert/check with invalid token returns 404", async () => {
  _getConversionTokenResult = null; // token not found

  const response = await route!.GET(makeRequest("invalid-or-expired-token"));

  assert.equal(response.status, 404);
});

test("AC-AUTH-17: GET /api/auth/convert/check with missing token param returns 400", async () => {
  const req = new NextRequest("http://localhost:3000/api/auth/convert/check");
  const response = await route!.GET(req);
  assert.equal(response.status, 400);
});
