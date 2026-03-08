import test from "node:test";
import assert from "node:assert/strict";
import { checkCommonPassword } from "./common-passwords";

test("checkCommonPassword returns null for a unique password", () => {
  assert.equal(checkCommonPassword("Tr0ub4dor&3"), null);
});

test("checkCommonPassword returns an error string for 'password'", () => {
  const result = checkCommonPassword("password");
  assert.equal(typeof result, "string");
  assert.match(result!, /too common/i);
});

test("checkCommonPassword returns an error string for '12345678'", () => {
  const result = checkCommonPassword("12345678");
  assert.equal(typeof result, "string");
});

test("checkCommonPassword is case-insensitive", () => {
  // 'Password' in mixed case should still be blocked
  const result = checkCommonPassword("PASSWORD");
  assert.equal(typeof result, "string");
});

test("checkCommonPassword returns null for a password that is not on the list", () => {
  assert.equal(checkCommonPassword("xK!9@z#mQp2$"), null);
});
