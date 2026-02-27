import test from "node:test";
import assert from "node:assert/strict";
import { getClientIp, rateLimit } from "./rate-limit";

test("rateLimit enforces limits and allows requests after window boundary", () => {
  const key = `rate-limit-boundary-${Date.now()}`;
  const originalNow = Date.now;

  try {
    let now = 1_000;
    Date.now = () => now;
    assert.deepEqual(rateLimit(key, 2, 1_000), { success: true, remaining: 1 });

    now = 1_500;
    assert.deepEqual(rateLimit(key, 2, 1_000), { success: true, remaining: 0 });

    now = 1_999;
    assert.deepEqual(rateLimit(key, 2, 1_000), { success: false, remaining: 0 });

    now = 2_001;
    assert.deepEqual(rateLimit(key, 2, 1_000), { success: true, remaining: 0 });
  } finally {
    Date.now = originalNow;
  }
});

test("getClientIp uses first forwarded IP, then x-real-ip, then unknown", () => {
  const forwarded = new Request("http://localhost", {
    headers: { "x-forwarded-for": " 198.51.100.7 , 203.0.113.5 " },
  });
  assert.equal(getClientIp(forwarded, true), "198.51.100.7");

  const realIp = new Request("http://localhost", {
    headers: { "x-forwarded-for": "   ", "x-real-ip": "203.0.113.9" },
  });
  assert.equal(getClientIp(realIp, true), "203.0.113.9");

  const unknown = new Request("http://localhost");
  assert.equal(getClientIp(unknown, true), "unknown");
});

test("getClientIp returns 'unknown' when TRUST_PROXY is not set", () => {
  const forwarded = new Request("http://localhost", {
    headers: { "x-forwarded-for": "198.51.100.7", "x-real-ip": "203.0.113.9" },
  });
  assert.equal(getClientIp(forwarded, false), "unknown");
});
