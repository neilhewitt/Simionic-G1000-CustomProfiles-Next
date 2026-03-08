/**
 * Unit tests for src/lib/user-service.ts
 *
 * All external dependencies (user-store, token-store, password, email,
 * data-store, and the MongoDB client) are replaced with mock.module() so
 * that no real database or SMTP connection is required.
 *
 * Run with:
 *   npx tsx --test --experimental-test-module-mocks src/lib/user-service.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mock, before, beforeEach } from "node:test";
import type * as UserServiceModule from "./user-service";
import type { User } from "./user-store";
import { getOwnerId } from "./owner-id";

// ---------------------------------------------------------------------------
// Configurable mock state
// ---------------------------------------------------------------------------

// user-store
let _findUserResult: User | null = null;
let _createUserResult: { user: User; created: boolean } = {
  user: {
    email: "alice@example.com",
    name: "Alice",
    passwordHash: "hashed",
    ownerId: "uuid-alice",
    createdAt: new Date(),
  },
  created: true,
};

const mockFindUserByEmail = mock.fn(async (_email: string): Promise<User | null> => _findUserResult);
const mockUpdatePassword = mock.fn(async (_email: string, _hash: string): Promise<void> => undefined);
const mockCreateUserIdempotent = mock.fn(async () => _createUserResult);

// token-store
let _createResetCodeResult = "reset-token-abc";
let _verifyResetCodeResult = true;
let _conversionTokenResult: { email: string; used: boolean } | null = null;
let _createConversionTokenResult = "conv-token-xyz";
let _markConversionTokenUsedResult = true;

const mockCreateResetCode = mock.fn(async (_email: string): Promise<string> => _createResetCodeResult);
const mockVerifyResetCode = mock.fn(async (_email: string, _code: string): Promise<boolean> => _verifyResetCodeResult);
const mockFindConversionToken = mock.fn(async (_token: string) => _conversionTokenResult);
const mockCreateConversionToken = mock.fn(async (_email: string): Promise<string> => _createConversionTokenResult);
const mockMarkConversionTokenUsed = mock.fn(async (_token: string, _session?: unknown): Promise<boolean> => _markConversionTokenUsedResult);

// password
const mockHashPassword = mock.fn(async (_password: string): Promise<string> => "hashed-password");

// email
const mockSendEmail = mock.fn(async (_to: string, _subject: string, _html: string): Promise<void> => undefined);
const mockGetEmailService = mock.fn(() => ({ sendEmail: mockSendEmail }));

// data-store
let _updateProfileOwnerResult = 3;
const mockUpdateProfileOwner = mock.fn(
  async (_oldOwner: string, _newOwner: string, _name: string, _session?: unknown): Promise<number> =>
    _updateProfileOwnerResult
);

// mongodb client (for completeConversion transaction)
const mockWithTransaction = mock.fn(async (fn: () => Promise<void>) => fn());
const mockEndSession = mock.fn(async (): Promise<void> => undefined);
const mockStartSession = mock.fn(() => ({
  withTransaction: mockWithTransaction,
  endSession: mockEndSession,
}));
const mockMongoClient = { startSession: mockStartSession };
const mockClientPromise = Promise.resolve(mockMongoClient);

// Typed handle populated in before()
let service: typeof UserServiceModule | null = null;

before(async () => {
  await mock.module("./user-store", {
    namedExports: {
      findUserByEmail: mockFindUserByEmail,
      updatePassword: mockUpdatePassword,
      createUserIdempotent: mockCreateUserIdempotent,
    },
  });

  await mock.module("./token-store", {
    namedExports: {
      createResetCode: mockCreateResetCode,
      verifyResetCode: mockVerifyResetCode,
      findConversionToken: mockFindConversionToken,
      createConversionToken: mockCreateConversionToken,
      markConversionTokenUsed: mockMarkConversionTokenUsed,
    },
  });

  await mock.module("./password", {
    namedExports: {
      hashPassword: mockHashPassword,
    },
  });

  await mock.module("./email", {
    namedExports: {
      getEmailService: mockGetEmailService,
    },
  });

  await mock.module("./data-store", {
    namedExports: {
      updateProfileOwner: mockUpdateProfileOwner,
    },
  });

  await mock.module("./mongodb", {
    defaultExport: mockClientPromise,
    namedExports: {
      getDb: mock.fn(async () => ({})),
    },
  });

  service = await import("./user-service") as typeof UserServiceModule;
});

// Reset all mock state before each test
beforeEach(() => {
  [
    mockFindUserByEmail, mockUpdatePassword, mockCreateUserIdempotent,
    mockCreateResetCode, mockVerifyResetCode, mockFindConversionToken,
    mockCreateConversionToken, mockMarkConversionTokenUsed,
    mockHashPassword, mockSendEmail, mockGetEmailService,
    mockUpdateProfileOwner, mockWithTransaction, mockEndSession, mockStartSession,
  ].forEach((fn) => fn.mock.resetCalls());

  _findUserResult = null;
  _createUserResult = {
    user: {
      email: "alice@example.com",
      name: "Alice",
      passwordHash: "hashed",
      ownerId: "uuid-alice",
      createdAt: new Date(),
    },
    created: true,
  };
  _createResetCodeResult = "reset-token-abc";
  _verifyResetCodeResult = true;
  _conversionTokenResult = null;
  _createConversionTokenResult = "conv-token-xyz";
  _markConversionTokenUsedResult = true;
  _updateProfileOwnerResult = 3;
});

// ---------------------------------------------------------------------------
// Error class smoke-tests
// ---------------------------------------------------------------------------

test("ConflictError has correct name", () => {
  const err = new service!.ConflictError("conflict");
  assert.equal(err.name, "ConflictError");
  assert.ok(err instanceof Error);
});

test("ValidationError has correct name", () => {
  const err = new service!.ValidationError("invalid");
  assert.equal(err.name, "ValidationError");
  assert.ok(err instanceof Error);
});

test("InconsistentStateError has correct name", () => {
  const err = new service!.InconsistentStateError("bad state");
  assert.equal(err.name, "InconsistentStateError");
  assert.ok(err instanceof Error);
});

// ---------------------------------------------------------------------------
// registerUser
// ---------------------------------------------------------------------------

test("registerUser hashes the password and creates a new user", async () => {
  const result = await service!.registerUser("Alice", "alice@example.com", "Secr3t!Pass");

  assert.equal(mockHashPassword.mock.calls.length, 1);
  assert.equal(mockHashPassword.mock.calls[0].arguments[0], "Secr3t!Pass");
  assert.equal(mockCreateUserIdempotent.mock.calls.length, 1);
  assert.equal(result.ownerId, "uuid-alice");
});

test("registerUser trims whitespace from the name", async () => {
  await service!.registerUser("  Alice  ", "alice@example.com", "Secr3t!Pass");

  const nameArg = mockCreateUserIdempotent.mock.calls[0].arguments[1] as string;
  assert.equal(nameArg, "Alice");
});

test("registerUser throws ConflictError when user already exists", async () => {
  _createUserResult = { ..._createUserResult, created: false };

  await assert.rejects(
    () => service!.registerUser("Alice", "alice@example.com", "Secr3t!Pass"),
    (err: unknown) => {
      assert.ok(err instanceof service!.ConflictError);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// requestPasswordReset
// ---------------------------------------------------------------------------

test("requestPasswordReset does nothing (zero-disclosure) when user is not found", async () => {
  _findUserResult = null;

  // Should resolve without throwing
  await assert.doesNotReject(() => service!.requestPasswordReset("nobody@example.com"));

  // No reset code created, no email sent
  assert.equal(mockCreateResetCode.mock.calls.length, 0);
  assert.equal(mockSendEmail.mock.calls.length, 0);
});

test("requestPasswordReset creates a reset code and sends email when user exists", async () => {
  _findUserResult = {
    email: "alice@example.com",
    name: "Alice",
    passwordHash: "h",
    ownerId: "uuid-alice",
    createdAt: new Date(),
  };
  _createResetCodeResult = "tok123";

  await service!.requestPasswordReset("alice@example.com");

  assert.equal(mockCreateResetCode.mock.calls.length, 1);
  assert.equal(mockGetEmailService.mock.calls.length, 1);
  assert.equal(mockSendEmail.mock.calls.length, 1);

  const [to, subject, body] = mockSendEmail.mock.calls[0].arguments as [string, string, string];
  assert.equal(to, "alice@example.com");
  assert.match(subject, /password reset/i);
  assert.match(body, /tok123/);
});

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------

test("resetPassword throws ValidationError when user is not found", async () => {
  _findUserResult = null;

  await assert.rejects(
    () => service!.resetPassword("ghost@example.com", "token", "NewPassw0rd!"),
    (err: unknown) => {
      assert.ok(err instanceof service!.ValidationError);
      return true;
    }
  );
});

test("resetPassword throws ValidationError when reset code is invalid", async () => {
  _findUserResult = {
    email: "alice@example.com",
    name: "Alice",
    passwordHash: "h",
    ownerId: "uuid-alice",
    createdAt: new Date(),
  };
  _verifyResetCodeResult = false;

  await assert.rejects(
    () => service!.resetPassword("alice@example.com", "bad-token", "NewPassw0rd!"),
    (err: unknown) => {
      assert.ok(err instanceof service!.ValidationError);
      return true;
    }
  );
});

test("resetPassword hashes the new password and updates it on success", async () => {
  _findUserResult = {
    email: "alice@example.com",
    name: "Alice",
    passwordHash: "old-hash",
    ownerId: "uuid-alice",
    createdAt: new Date(),
  };
  _verifyResetCodeResult = true;

  await service!.resetPassword("alice@example.com", "valid-token", "NewPassw0rd!");

  assert.equal(mockHashPassword.mock.calls.length, 1);
  assert.equal(mockUpdatePassword.mock.calls.length, 1);
  assert.equal(mockUpdatePassword.mock.calls[0].arguments[0], "alice@example.com");
});

// ---------------------------------------------------------------------------
// requestConversion
// ---------------------------------------------------------------------------

test("requestConversion does nothing (zero-disclosure) when user already has an account", async () => {
  _findUserResult = {
    email: "alice@example.com",
    name: "Alice",
    passwordHash: "h",
    ownerId: "uuid-alice",
    createdAt: new Date(),
  };

  await assert.doesNotReject(() => service!.requestConversion("alice@example.com"));

  assert.equal(mockCreateConversionToken.mock.calls.length, 0);
  assert.equal(mockSendEmail.mock.calls.length, 0);
});

test("requestConversion creates a token and sends email when user is not yet registered", async () => {
  _findUserResult = null;
  _createConversionTokenResult = "conv-tok-99";

  await service!.requestConversion("new@example.com");

  assert.equal(mockCreateConversionToken.mock.calls.length, 1);
  assert.equal(mockSendEmail.mock.calls.length, 1);

  const [to, subject, body] = mockSendEmail.mock.calls[0].arguments as [string, string, string];
  assert.equal(to, "new@example.com");
  assert.match(subject, /account conversion/i);
  assert.match(body, /conv-tok-99/);
});

test("requestConversion passes email to createConversionToken preserving original casing", async () => {
  // The email must reach createConversionToken without being lowercased. Owner IDs
  // in the legacy C# database were derived from the email exactly as Microsoft
  // authentication supplied it, so we must preserve the casing to allow
  // completeConversion to reproduce the same owner ID later.
  _findUserResult = null;
  _createConversionTokenResult = "conv-tok-x";

  await service!.requestConversion("Alice@Example.COM");

  assert.equal(mockCreateConversionToken.mock.calls.length, 1);
  const [emailArg] = mockCreateConversionToken.mock.calls[0].arguments as [string];
  assert.equal(emailArg, "Alice@Example.COM");
});

// ---------------------------------------------------------------------------
// completeConversion
// ---------------------------------------------------------------------------

test("completeConversion throws ValidationError when token is not found", async () => {
  _conversionTokenResult = null;

  await assert.rejects(
    () => service!.completeConversion("bad-token", "alice@example.com", "Alice", "Secr3t!Pass"),
    (err: unknown) => {
      assert.ok(err instanceof service!.ValidationError);
      assert.match((err as Error).message, /invalid or expired/i);
      return true;
    }
  );
});

test("completeConversion throws ValidationError when email does not match token", async () => {
  _conversionTokenResult = { email: "alice@example.com", used: false };

  await assert.rejects(
    () => service!.completeConversion("valid-token", "bob@example.com", "Bob", "Secr3t!Pass"),
    (err: unknown) => {
      assert.ok(err instanceof service!.ValidationError);
      assert.match((err as Error).message, /email address does not match/i);
      return true;
    }
  );
});

test("completeConversion returns idempotent message when token already used and user exists", async () => {
  _conversionTokenResult = { email: "alice@example.com", used: true };
  _findUserResult = {
    email: "alice@example.com",
    name: "Alice",
    passwordHash: "h",
    ownerId: "uuid-alice",
    createdAt: new Date(),
  };

  const result = await service!.completeConversion(
    "used-token", "alice@example.com", "Alice", "Secr3t!Pass"
  );
  assert.match(result.message, /already converted/i);
  assert.equal(result.profilesMigrated, 0);
});

test("completeConversion throws InconsistentStateError when token used but user not found", async () => {
  _conversionTokenResult = { email: "alice@example.com", used: true };
  _findUserResult = null; // Token is used but user doesn't exist

  await assert.rejects(
    () => service!.completeConversion("used-token", "alice@example.com", "Alice", "Secr3t!Pass"),
    (err: unknown) => {
      assert.ok(err instanceof service!.InconsistentStateError);
      return true;
    }
  );
});

test("completeConversion completes successfully for a fresh token", async () => {
  _conversionTokenResult = { email: "alice@example.com", used: false };
  _updateProfileOwnerResult = 5;
  _createUserResult = {
    user: {
      email: "alice@example.com",
      name: "Alice",
      passwordHash: "hashed",
      ownerId: "new-uuid",
      createdAt: new Date(),
    },
    created: true,
  };

  const result = await service!.completeConversion(
    "fresh-token", "alice@example.com", "Alice", "Secr3t!Pass"
  );

  assert.match(result.message, /converted successfully/i);
  assert.equal(result.profilesMigrated, 5);
  assert.equal(mockHashPassword.mock.calls.length, 1);
  assert.equal(mockMarkConversionTokenUsed.mock.calls.length, 1);
});

test("completeConversion accepts email with different casing than the stored token email", async () => {
  // The token stores the email as the user supplied it when requesting conversion
  // (trimmed, not lowercased). The completion form compares case-insensitively,
  // so the user need not re-type in the exact same case.
  _conversionTokenResult = { email: "Alice@Example.com", used: false };
  _updateProfileOwnerResult = 0;

  const result = await service!.completeConversion(
    "tok", "  alice@example.com  ", "Alice", "Secr3t!Pass"
  );
  assert.match(result.message, /converted successfully/i);
});

test("completeConversion derives old owner ID from the token email, not the caller-supplied email", async () => {
  // The C# predecessor did not normalise email addresses; it used them exactly
  // as supplied by Microsoft authentication. Owner IDs stored in existing profiles
  // were therefore derived from the original casing. We must pass conversionToken.email
  // (the preserved-case email) to getOwnerId — NOT the caller's re-typed email —
  // so that the derived ID actually matches the profiles in the database.
  _conversionTokenResult = { email: "Alice@Example.com", used: false };
  _updateProfileOwnerResult = 3;

  await service!.completeConversion(
    "tok", "alice@example.com", "Alice", "Secr3t!Pass"
  );

  const calls = mockUpdateProfileOwner.mock.calls;
  assert.equal(calls.length, 1, "updateProfileOwner should be called exactly once");
  const [oldOwnerId] = calls[0].arguments as [string, ...unknown[]];
  const expectedOldOwnerId = getOwnerId("Alice@Example.com"); // token's preserved casing
  const wrongOwnerId = getOwnerId("alice@example.com");       // what normalisation would produce
  assert.notEqual(expectedOldOwnerId, wrongOwnerId, "precondition: the two casings produce different owner IDs");
  assert.equal(oldOwnerId, expectedOldOwnerId, "old owner ID must be derived from the token email, not the caller-supplied email");
});
