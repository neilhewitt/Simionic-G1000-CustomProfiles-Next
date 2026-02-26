import { getDb } from "./mongodb";
import { randomUUID } from "crypto";
import { MongoServerError } from "mongodb";

const COLLECTION = "users";

export interface User {
  email: string;
  name: string;
  passwordHash: string;
  ownerId: string;
  createdAt: Date;
}

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();
  const col = db.collection(COLLECTION);
  await col.createIndex({ email: 1 }, { unique: true });
  await col.createIndex({ ownerId: 1 });
  indexesEnsured = true;
}

export async function createUser(
  email: string,
  name: string,
  passwordHash: string
): Promise<User> {
  await ensureIndexes();
  const db = await getDb();
  const user: User = {
    email: email.toLowerCase().trim(),
    name,
    passwordHash,
    ownerId: randomUUID(),
    createdAt: new Date(),
  };
  await db.collection(COLLECTION).insertOne(user);
  return user;
}

/**
 * Creates a user idempotently. If a user with the same email already exists
 * (duplicate key on the unique email index), the existing user is returned
 * together with a flag indicating whether the user was newly created.
 * This is safe for retries and race conditions during account conversion.
 */
export async function createUserIdempotent(
  email: string,
  name: string,
  passwordHash: string
): Promise<{ user: User; created: boolean }> {
  await ensureIndexes();
  const db = await getDb();
  const normalizedEmail = email.toLowerCase().trim();
  const user: User = {
    email: normalizedEmail,
    name,
    passwordHash,
    ownerId: randomUUID(),
    createdAt: new Date(),
  };

  try {
    await db.collection(COLLECTION).insertOne(user);
    return { user, created: true };
  } catch (err) {
    // Duplicate key error code 11000 on the unique email index
    if (err instanceof MongoServerError && err.code === 11000) {
      const existing = await findUserByEmail(normalizedEmail);
      if (!existing) {
        throw new Error(
          `Duplicate key error on email "${normalizedEmail}" but user not found on re-read`
        );
      }
      return { user: existing, created: false };
    }
    throw err;
  }
}

export async function findUserByEmail(
  email: string
): Promise<User | null> {
  await ensureIndexes();
  const db = await getDb();
  const doc = await db
    .collection(COLLECTION)
    .findOne({ email: email.toLowerCase().trim() });
  return doc as unknown as User | null;
}

export async function findUserByOwnerId(
  ownerId: string
): Promise<User | null> {
  await ensureIndexes();
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ ownerId });
  return doc as unknown as User | null;
}

export async function updatePassword(
  email: string,
  newPasswordHash: string
): Promise<void> {
  await ensureIndexes();
  const db = await getDb();
  await db
    .collection(COLLECTION)
    .updateOne(
      { email: email.toLowerCase().trim() },
      { $set: { passwordHash: newPasswordHash } }
    );
}
