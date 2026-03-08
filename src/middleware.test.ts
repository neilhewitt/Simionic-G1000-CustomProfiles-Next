/**
 * Integration tests for src/middleware.ts
 *
 * Tests CSRF protection and CSP nonce header behaviour (AC-SECURITY-01 – AC-SECURITY-04).
 *
 * The middleware function is a plain synchronous function that takes a NextRequest
 * and returns a NextResponse, so we can call it directly without a running server.
 *
 * Run with:
 *   npx tsx --test src/middleware.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function makeRequest(
  url: string,
  method: string,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(url, { method, headers });
}

// ---------------------------------------------------------------------------
// AC-SECURITY-01: CSRF — mutating request without a matching Origin is rejected
// ---------------------------------------------------------------------------

test("AC-SECURITY-01: POST to /api/profiles without Origin header returns 403", async () => {
  const req = makeRequest("http://localhost:3000/api/profiles/some-id", "POST");
  const res = middleware(req);
  assert.equal(res.status, 403);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "Forbidden");
});

test("AC-SECURITY-01: POST to /api/profiles with wrong Origin header returns 403", async () => {
  const req = makeRequest("http://localhost:3000/api/profiles/some-id", "POST", {
    origin: "https://evil.example.com",
  });
  const res = middleware(req);
  assert.equal(res.status, 403);
});

test("AC-SECURITY-01: DELETE to /api/profiles with correct Origin passes CSRF check", async () => {
  const req = makeRequest("http://localhost:3000/api/profiles/some-id", "DELETE", {
    origin: "http://localhost:3000",
  });
  const res = middleware(req);
  // Passes CSRF → Next.js would serve it; status won't be 403
  assert.notEqual(res.status, 403);
});

// ---------------------------------------------------------------------------
// AC-SECURITY-02: CSRF — GET requests are always passed through
// ---------------------------------------------------------------------------

test("AC-SECURITY-02: GET to /api/profiles without Origin returns non-403", async () => {
  const req = makeRequest("http://localhost:3000/api/profiles", "GET");
  const res = middleware(req);
  assert.notEqual(res.status, 403);
});

// ---------------------------------------------------------------------------
// AC-SECURITY-03: CSRF — NextAuth paths are subject to Origin check
// ---------------------------------------------------------------------------

test("AC-SECURITY-03: POST to /api/auth/callback/credentials with matching Origin is accepted", async () => {
  // Our middleware applies the Origin check to all /api/ routes, including
  // /api/auth/. When the browser submits the sign-in form from the same
  // origin, the Origin header matches and the request is accepted.
  const req = makeRequest(
    "http://localhost:3000/api/auth/callback/credentials",
    "POST",
    { origin: "http://localhost:3000" }
  );
  const res = middleware(req);
  assert.notEqual(res.status, 403);
});

test("AC-SECURITY-03: POST to /api/auth/callback/credentials with wrong Origin is rejected", async () => {
  // The middleware CSRF check applies to all /api/ paths, including NextAuth
  // callbacks. Cross-origin POST requests are blocked with 403.
  const req = makeRequest(
    "http://localhost:3000/api/auth/callback/credentials",
    "POST",
    { origin: "http://evil.example.com" }
  );
  const res = middleware(req);
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// AC-SECURITY-04: CSP nonce is set on every response
// ---------------------------------------------------------------------------

test("AC-SECURITY-04: Content-Security-Policy header is present on every response", async () => {
  const req = makeRequest("http://localhost:3000/", "GET");
  const res = middleware(req);
  const csp = res.headers.get("Content-Security-Policy");
  assert.ok(csp, "Content-Security-Policy header should be present");
  assert.ok(csp!.includes("nonce-"), "CSP should contain a nonce value");
});

test("AC-SECURITY-04: Nonce is different on each request", async () => {
  const req1 = makeRequest("http://localhost:3000/", "GET");
  const req2 = makeRequest("http://localhost:3000/", "GET");
  const csp1 = middleware(req1).headers.get("Content-Security-Policy") ?? "";
  const csp2 = middleware(req2).headers.get("Content-Security-Policy") ?? "";

  // Extract nonce values from each header
  const nonceRegex = /nonce-([A-Za-z0-9+/=]+)/;
  const nonce1 = nonceRegex.exec(csp1)?.[1];
  const nonce2 = nonceRegex.exec(csp2)?.[1];

  assert.ok(nonce1, "First response should have a nonce");
  assert.ok(nonce2, "Second response should have a nonce");
  assert.notEqual(nonce1, nonce2, "Each request should get a unique nonce");
});
