import test from "node:test";
import assert from "node:assert/strict";
import { mock, before, beforeEach } from "node:test";
import { NextRequest } from "next/server";
import type * as RouteModule from "./[...nextauth]/route";

const ORIGINAL_TRUST_PROXY = process.env.TRUST_PROXY;

const mockGetHandler = mock.fn(async () => new Response(null, { status: 200 }));
const mockPostHandler = mock.fn(async () => Response.json({ ok: true }));

let route: typeof RouteModule | null = null;

before(async () => {
  process.env.TRUST_PROXY = "true";

  await mock.module("@/lib/auth", {
    namedExports: {
      handlers: {
        GET: mockGetHandler,
        POST: mockPostHandler,
      },
    },
  });

  route = await import("./[...nextauth]/route") as typeof RouteModule;
});

beforeEach(() => {
  mockGetHandler.mock.resetCalls();
  mockPostHandler.mock.resetCalls();
});

function makePostRequest(ip: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "x-forwarded-for": ip,
    },
  });
}

test("GET /api/auth/[...nextauth] delegates to the NextAuth handler", async () => {
  const response = await route!.GET(new NextRequest("http://localhost:3000/api/auth/session"));

  assert.equal(response.status, 200);
  assert.equal(mockGetHandler.mock.calls.length, 1);
});

test("POST /api/auth/[...nextauth] delegates to NextAuth when under the rate limit", async () => {
  const ip = `10.40.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const response = await route!.POST(makePostRequest(ip));

  assert.equal(response.status, 200);
  assert.equal(mockPostHandler.mock.calls.length, 1);
});

test("POST /api/auth/[...nextauth] is rate-limited after 10 requests", async () => {
  const ip = `10.41.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;

  for (let i = 0; i < 10; i++) {
    const response = await route!.POST(makePostRequest(ip));
    assert.notEqual(response.status, 429);
  }

  const throttled = await route!.POST(makePostRequest(ip));

  assert.equal(throttled.status, 429);
  assert.equal(mockPostHandler.mock.calls.length, 10);
});

test.after(() => {
  process.env.TRUST_PROXY = ORIGINAL_TRUST_PROXY;
});