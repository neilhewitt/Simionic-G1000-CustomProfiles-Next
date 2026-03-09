/**
 * Integration tests for src/app/api/auth/forgot-password/route.ts
 *
 * Covers the zero-disclosure throttling behaviour.
 *
 * All real I/O is replaced with mock.module() so no live database is needed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mock, before, beforeEach } from "node:test";
import type * as RouteModule from "./route";

const mockRequestPasswordReset = mock.fn(async (_email: string): Promise<void> => undefined);

let route: typeof RouteModule | null = null;

before(async () => {
  await mock.module("@/lib/user-service", {
    namedExports: {
      requestPasswordReset: mockRequestPasswordReset,
    },
  });

  route = await import("./route") as typeof RouteModule;
});

beforeEach(() => {
  mockRequestPasswordReset.mock.resetCalls();
});

test("forgot-password keeps zero-disclosure 200 shape when throttled", async () => {
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;

  for (let i = 0; i < 5; i++) {
    const response = await route!.POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({}),
      }) as never
    );
    assert.equal(response.status, 200);
  }

  const throttled = await route!.POST(
    new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({}),
    }) as never
  );

  assert.equal(throttled.status, 200);
  assert.equal(throttled.headers.get("retry-after"), "900");
  assert.deepEqual(await throttled.json(), {
    message: "If an account exists, a reset link has been sent.",
  });
});
