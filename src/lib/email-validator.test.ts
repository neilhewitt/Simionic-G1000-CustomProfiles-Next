import test from "node:test";
import assert from "node:assert/strict";
import { isValidEmail } from "./email-validator";

test("isValidEmail returns true for a standard valid email", () => {
  assert.equal(isValidEmail("user@example.com"), true);
});

test("isValidEmail returns true for an email with subdomains", () => {
  assert.equal(isValidEmail("user@mail.example.co.uk"), true);
});

test("isValidEmail returns true for an email with plus addressing", () => {
  assert.equal(isValidEmail("user+tag@example.com"), true);
});

test("isValidEmail returns false when @ is missing", () => {
  assert.equal(isValidEmail("userexample.com"), false);
});

test("isValidEmail returns false when domain part is missing", () => {
  assert.equal(isValidEmail("user@"), false);
});

test("isValidEmail returns false when local part is missing", () => {
  assert.equal(isValidEmail("@example.com"), false);
});

test("isValidEmail returns false when there are spaces", () => {
  assert.equal(isValidEmail("user name@example.com"), false);
});

test("isValidEmail returns false for an empty string", () => {
  assert.equal(isValidEmail(""), false);
});

test("isValidEmail returns false when input exceeds 254 characters", () => {
  // "@b.com" = 6 chars; to exceed 254, local part needs to be at least 249 chars
  const longLocal = "a".repeat(249);
  assert.equal(isValidEmail(`${longLocal}@b.com`), false);
});

test("isValidEmail returns false for a number", () => {
  assert.equal(isValidEmail(42), false);
});

test("isValidEmail returns false for null", () => {
  assert.equal(isValidEmail(null), false);
});

test("isValidEmail returns false for undefined", () => {
  assert.equal(isValidEmail(undefined), false);
});

test("isValidEmail returns false for an object", () => {
  assert.equal(isValidEmail({ email: "user@example.com" }), false);
});
