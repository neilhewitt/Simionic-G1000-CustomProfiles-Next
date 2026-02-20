import { getDb } from "./mongodb";
import { randomUUID, randomInt, createHash } from "crypto";

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
 * Creates a 6-digit reset code for the given email.
 * Returns the plaintext code (to include in the email).
 * The code is stored as a SHA-256 hash.
 */
export async function createResetCode(email: string): Promise<string> {
  await ensureResetIndexes();
  const db = await getDb();

  const code = String(randomInt(100000, 999999));
  const record: ResetCode = {
    email: email.toLowerCase().trim(),
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    used: false,
  };

  await db.collection(RESET_COLLECTION).insertOne(record);
  return code;
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
  token: string;
  expiresAt: Date;
  used: boolean;
}

let conversionIndexesEnsured = false;

async function ensureConversionIndexes() {
  if (conversionIndexesEnsured) return;
  const db = await getDb();
  const col = db.collection(CONVERSION_COLLECTION);
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await col.createIndex({ token: 1 });
  conversionIndexesEnsured = true;
}

/**
 * Creates a conversion token for the given email.
 * Returns the token string (to include in the conversion link).
 */
export async function createConversionToken(
  email: string
): Promise<string> {
  await ensureConversionIndexes();
  const db = await getDb();

  const token = randomUUID();
  const record: ConversionToken = {
    email: email.toLowerCase().trim(),
    token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    used: false,
  };

  await db.collection(CONVERSION_COLLECTION).insertOne(record);
  return token;
}

/**
 * Returns a valid (not expired, not used) conversion token, or null.
 */
export async function getConversionToken(
  token: string
): Promise<ConversionToken | null> {
  await ensureConversionIndexes();
  const db = await getDb();

  const doc = await db.collection(CONVERSION_COLLECTION).findOne({
    token,
    expiresAt: { $gt: new Date() },
    used: false,
  });

  return doc as unknown as ConversionToken | null;
}

/**
 * Marks a conversion token as used.
 */
export async function markConversionTokenUsed(
  token: string
): Promise<void> {
  await ensureConversionIndexes();
  const db = await getDb();

  await db
    .collection(CONVERSION_COLLECTION)
    .updateOne({ token }, { $set: { used: true } });
}
