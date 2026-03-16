import test from "node:test";
import assert from "node:assert/strict";
import { getOwnerId } from "./owner-id";

test("getOwnerId returns a 48-character uppercase hex string", async () => {
  const id = await getOwnerId("test@example.com");
  assert.match(id, /^[0-9A-F]{48}$/);
});

test("getOwnerId is deterministic: same email always yields the same ID", async () => {
  const email = "alice@example.com";
  assert.equal(await getOwnerId(email), await getOwnerId(email));
});

test("getOwnerId produces different IDs for different emails", async () => {
  assert.notEqual(await getOwnerId("alice@example.com"), await getOwnerId("bob@example.com"));
});

test("getOwnerId is case-sensitive (emails are not normalised inside getOwnerId)", async () => {
  // The derivation is intentionally case-sensitive (matches the original C# implementation).
  const lower = await getOwnerId("Alice@example.com");
  const upper = await getOwnerId("ALICE@EXAMPLE.COM");
  assert.notEqual(lower, upper);
});
