import { getDb } from "./mongodb";
import { randomUUID, randomBytes, createHash } from "crypto";
import { ClientSession } from "mongodb";

const RESET_COLLECTION = "password_reset_codes";
const CONVERSION_COLLECTION = "conversion_tokens";

// --- Helpers ---

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// --- Password Reset Codes ---

export interface ResetCode {
  email: string;
  codeHash: string;
  expiresAt: Date;
  used: boolean;
}

let resetIndexesEnsured = false;

async function ensureResetIndexes() {
  if (resetIndexesEnsured) return;
  const db = await getDb();
  const col = db.collection(RESET_COLLECTION);
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await col.createIndex({ email: 1 });
  resetIndexesEnsured = true;
}

/**
 * Creates a secure random reset token for the given email.
 * Returns the plaintext token (to include in the reset link).
 * Only the SHA-256 hash of the token is stored in the database.
 */
export async function createResetCode(email: string): Promise<string> {
  await ensureResetIndexes();
  const db = await getDb();

  const token = randomBytes(32).toString("hex");
  const record: ResetCode = {
    email: email.toLowerCase().trim(),
    codeHash: sha256(token),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    used: false,
  };

  await db.collection(RESET_COLLECTION).insertOne(record);
  return token;
}

/**
 * Verifies a reset code. If valid, marks it as used and returns true.
 */
export async function verifyResetCode(
  email: string,
  code: string
): Promise<boolean> {
  await ensureResetIndexes();
  const db = await getDb();

  const result = await db.collection(RESET_COLLECTION).findOneAndUpdate(
    {
      email: email.toLowerCase().trim(),
      codeHash: sha256(code),
      expiresAt: { $gt: new Date() },
      used: false,
    },
    { $set: { used: true } }
  );

  return result !== null;
}

// --- Conversion Tokens ---

export interface ConversionToken {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
}

let conversionIndexesEnsured = false;

async function ensureConversionIndexes() {
  if (conversionIndexesEnsured) return;
  const db = await getDb();
  const col = db.collection(CONVERSION_COLLECTION);
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await col.createIndex({ tokenHash: 1 }, { unique: true });
  conversionIndexesEnsured = true;
}

/**
 * Creates a conversion token for the given email.
 * Returns the raw token string (to include in the conversion link).
 * Only the SHA-256 hash of the token is stored in the database.
 */
export async function createConversionToken(
  email: string
): Promise<string> {
  await ensureConversionIndexes();
  const db = await getDb();

  const token = randomUUID();
  const record: ConversionToken = {
    email: email.toLowerCase().trim(),
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    used: false,
  };

  await db.collection(CONVERSION_COLLECTION).insertOne(record);
  return token;
}

/**
 * Returns a valid (not expired, not used) conversion token record, or null.
 * Accepts the raw token; looks up by its SHA-256 hash.
 */
export async function getConversionToken(
  token: string
): Promise<ConversionToken | null> {
  await ensureConversionIndexes();
  const db = await getDb();

  const doc = await db.collection(CONVERSION_COLLECTION).findOne({
    tokenHash: sha256(token),
    expiresAt: { $gt: new Date() },
    used: false,
  });

  return doc as unknown as ConversionToken | null;
}

/**
 * Returns a conversion token record regardless of its `used` status (but still
 * requires it to be non-expired). Used by the idempotent conversion flow to
 * detect retries on an already-completed token.
 */
export async function findConversionToken(
  token: string
): Promise<ConversionToken | null> {
  await ensureConversionIndexes();
  const db = await getDb();

  const doc = await db.collection(CONVERSION_COLLECTION).findOne({
    tokenHash: sha256(token),
    expiresAt: { $gt: new Date() },
  });

  return doc as unknown as ConversionToken | null;
}

/**
 * Atomically marks a conversion token as used only if it has not already been
 * marked. Returns true if this call actually flipped the flag, false if it was
 * already used (safe for retries).
 */
export async function markConversionTokenUsed(
  token: string,
  session?: ClientSession
): Promise<boolean> {
  await ensureConversionIndexes();
  const db = await getDb();

  const result = await db
    .collection(CONVERSION_COLLECTION)
    .updateOne(
      { tokenHash: sha256(token), used: false },
      { $set: { used: true } },
      { session }
    );

  return result.modifiedCount > 0;
}

/**
 * Exported initialiser — called at startup via src/instrumentation.ts so that
 * indexes are created once rather than lazily before each operation.
 */
export async function initTokenStore(): Promise<void> {
  await ensureResetIndexes();
  await ensureConversionIndexes();
}
