import test from "node:test";
import assert from "node:assert/strict";
import { getUserFriendlyError } from "./error-utils";

test("getUserFriendlyError returns the generic message for an Error object", () => {
  const result = getUserFriendlyError(new Error("internal details"));
  assert.equal(result, "Something went wrong. Please try again later.");
});

test("getUserFriendlyError returns the generic message for a string", () => {
  const result = getUserFriendlyError("some string error");
  assert.equal(result, "Something went wrong. Please try again later.");
});

test("getUserFriendlyError returns the generic message for null", () => {
  const result = getUserFriendlyError(null);
  assert.equal(result, "Something went wrong. Please try again later.");
});

test("getUserFriendlyError returns the generic message for undefined", () => {
  const result = getUserFriendlyError(undefined);
  assert.equal(result, "Something went wrong. Please try again later.");
});
