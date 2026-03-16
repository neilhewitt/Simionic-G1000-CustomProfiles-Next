import test from "node:test";
import assert from "node:assert/strict";
import { getAppUrlWarning } from "./app-url";

test("getAppUrlWarning returns null outside production", () => {
  assert.equal(getAppUrlWarning({ NODE_ENV: "development" }), null);
});

test("getAppUrlWarning warns when APP_URL is missing in production", () => {
  const warning = getAppUrlWarning({ NODE_ENV: "production" });
  assert.match(warning ?? "", /not set/i);
});

test("getAppUrlWarning warns when APP_URL is invalid in production", () => {
  const warning = getAppUrlWarning({ NODE_ENV: "production", APP_URL: "not-a-url" });
  assert.match(warning ?? "", /valid absolute url/i);
});

test("getAppUrlWarning warns when APP_URL is not HTTPS in production", () => {
  const warning = getAppUrlWarning({ NODE_ENV: "production", APP_URL: "http://example.com" });
  assert.match(warning ?? "", /https/i);
});

test("getAppUrlWarning returns null for a valid HTTPS APP_URL in production", () => {
  assert.equal(
    getAppUrlWarning({ NODE_ENV: "production", APP_URL: "https://example.com" }),
    null
  );
});