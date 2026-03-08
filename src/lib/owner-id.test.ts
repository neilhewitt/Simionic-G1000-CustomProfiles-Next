import test from "node:test";
import assert from "node:assert/strict";
import { getOwnerId } from "./owner-id";

test("getOwnerId returns a 48-character uppercase hex string", () => {
  const id = getOwnerId("test@example.com");
  assert.match(id, /^[0-9A-F]{48}$/);
});

test("getOwnerId is deterministic: same email always yields the same ID", () => {
  const email = "alice@example.com";
  assert.equal(getOwnerId(email), getOwnerId(email));
});

test("getOwnerId produces different IDs for different emails", () => {
  assert.notEqual(getOwnerId("alice@example.com"), getOwnerId("bob@example.com"));
});

test("getOwnerId is case-sensitive (emails are not normalised inside getOwnerId)", () => {
  // The derivation is intentionally case-sensitive (matches the original C# implementation).
  const lower = getOwnerId("Alice@example.com");
  const upper = getOwnerId("ALICE@EXAMPLE.COM");
  assert.notEqual(lower, upper);
});
