import { getDb } from "./mongodb";
import { randomUUID } from "crypto";

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
