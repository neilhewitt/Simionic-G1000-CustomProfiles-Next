import test from "node:test";
import assert from "node:assert/strict";
import { mock, before, beforeEach } from "node:test";
import type * as TokenStoreModule from "./token-store";

const mockCreateIndex = mock.fn(async () => undefined);
const mockDeleteMany = mock.fn(async () => ({ deletedCount: 0 }));
const mockInsertOne = mock.fn(async () => ({ acknowledged: true }));

const mockCollection = {
  createIndex: mockCreateIndex,
  deleteMany: mockDeleteMany,
  insertOne: mockInsertOne,
};

const mockGetDb = mock.fn(async () => ({
  collection: () => mockCollection,
}));

let tokenStore: typeof TokenStoreModule | null = null;

before(async () => {
  await mock.module("./mongodb", {
    namedExports: {
      getDb: mockGetDb,
    },
  });

  tokenStore = await import("./token-store") as typeof TokenStoreModule;
});

beforeEach(() => {
  mockGetDb.mock.resetCalls();
  mockCreateIndex.mock.resetCalls();
  mockDeleteMany.mock.resetCalls();
  mockInsertOne.mock.resetCalls();
});

test("createResetCode invalidates existing unused tokens for the same email before inserting a new one", async () => {
  const token = await tokenStore!.createResetCode(" Alice@Example.com ");

  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(mockDeleteMany.mock.calls.length, 1);
  assert.equal(mockInsertOne.mock.calls.length, 1);

  const deleteFilter = mockDeleteMany.mock.calls[0].arguments[0] as {
    email: string;
    expiresAt: { $gt: Date };
    used: boolean;
  };
  assert.equal(deleteFilter.email, "alice@example.com");
  assert.equal(deleteFilter.used, false);
  assert.ok(deleteFilter.expiresAt.$gt instanceof Date);

  const inserted = mockInsertOne.mock.calls[0].arguments[0] as {
    email: string;
    codeHash: string;
    expiresAt: Date;
    used: boolean;
  };
  assert.equal(inserted.email, "alice@example.com");
  assert.equal(inserted.used, false);
  assert.ok(inserted.expiresAt instanceof Date);
  assert.match(inserted.codeHash, /^[0-9a-f]{64}$/);
});