import { findUserByEmail, updatePassword, createUserIdempotent } from "./user-store";
import { createResetCode, verifyResetCode, findConversionToken, markConversionTokenUsed, createConversionToken } from "./token-store";
import { hashPassword } from "./password";
import { getEmailService } from "./email";
import { getOwnerId } from "./owner-id";
import { updateProfileOwner } from "./data-store";
import clientPromise from "./mongodb";

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class InconsistentStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InconsistentStateError";
  }
}

export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<{ ownerId: string }> {
  const passwordHash = await hashPassword(password);
  const { user, created } = await createUserIdempotent(email, name.trim(), passwordHash);
  if (!created) {
    throw new ConflictError("An account with this email already exists.");
  }
  return { ownerId: user.ownerId };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user) return; // Zero-disclosure

  const token = await createResetCode(email);
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    console.warn("APP_URL is not set; reset link will use localhost fallback.");
  }
  const resetLink = `${appUrl ?? "http://localhost:3000"}/auth/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  const emailService = getEmailService();

  await emailService.sendEmail(
    user.email,
    "Password Reset — Simionic G1000 Profile DB",
    `<h2>Password Reset</h2>
     <p>Click the link below to reset your password:</p>
     <p><a href="${resetLink}">${resetLink}</a></p>
     <p>This link will expire in 15 minutes.</p>
     <p>If you did not request this reset, you can safely ignore this email.</p>`
  );
}

export async function resetPassword(
  email: string,
  token: string,
  password: string
): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new ValidationError("Invalid or expired code.");
  }

  const valid = await verifyResetCode(email, token);
  if (!valid) {
    throw new ValidationError("Invalid or expired code.");
  }

  const newHash = await hashPassword(password);
  await updatePassword(email, newHash);
}

export async function requestConversion(email: string): Promise<void> {
  const existing = await findUserByEmail(email);
  if (existing) return; // Zero-disclosure

  const token = await createConversionToken(email);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/auth/convert/${token}`;

  const emailService = getEmailService();
  await emailService.sendEmail(
    email,
    "Account Conversion — Simionic G1000 Profile DB",
    `<h2>Account Conversion</h2>
     <p>You requested to convert your Microsoft account to a local account.</p>
     <p>Click the link below to complete the conversion:</p>
     <p><a href="${link}">${link}</a></p>
     <p>This link will expire in 24 hours.</p>
     <p>If you did not request this, you can safely ignore this email.</p>`
  );
}

export async function completeConversion(
  token: string,
  email: string,
  name: string,
  password: string
): Promise<{ message: string; profilesMigrated: number }> {
  const conversionToken = await findConversionToken(token);
  if (!conversionToken) {
    throw new ValidationError("Invalid or expired conversion link.");
  }

  if (conversionToken.email !== email.toLowerCase().trim()) {
    throw new ValidationError("Email address does not match the conversion request.");
  }

  // Idempotent retry: token already used
  if (conversionToken.used) {
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      console.info(`Conversion retry: token already used, user exists (email=${email})`);
      return { message: "Account already converted.", profilesMigrated: 0 };
    }
    console.error(`Conversion inconsistency: token used but no user found (email=${email})`);
    throw new InconsistentStateError("Conversion is in an inconsistent state. Please contact support.");
  }

  const oldOwnerId = getOwnerId(email.toLowerCase().trim());
  const passwordHash = await hashPassword(password);

  // Wrap all three database operations in a MongoDB multi-document transaction
  // so that a crash or partial failure cannot leave the system in an inconsistent
  // state. Requires a replica set or Atlas cluster (not a standalone mongod).
  const client = await clientPromise;
  const dbSession = client.startSession();

  // Use definite-assignment assertions: TypeScript cannot flow-analyse through
  // async callbacks, but withTransaction guarantees the callback completes or
  // throws before returning.
  let user!: Awaited<ReturnType<typeof createUserIdempotent>>["user"];
  let created!: boolean;
  let migratedCount!: number;

  try {
    await dbSession.withTransaction(async () => {
      const result = await createUserIdempotent(email, name.trim(), passwordHash, dbSession);
      user = result.user;
      created = result.created;

      migratedCount = await updateProfileOwner(oldOwnerId, user.ownerId, user.name, dbSession);
      await markConversionTokenUsed(token, dbSession);
    });
  } finally {
    await dbSession.endSession();
  }

  if (created) {
    console.info(`Conversion: created user (email=${email}, ownerId=${user.ownerId})`);
  } else {
    console.info(`Conversion: user already exists, proceeding (email=${email}, ownerId=${user.ownerId})`);
  }
  console.info(`Conversion: migrated ${migratedCount} profile(s) (email=${email}, oldOwner=${oldOwnerId}, newOwner=${user.ownerId})`);
  console.info(`Conversion: transaction committed (email=${email})`);

  return { message: "Account converted successfully.", profilesMigrated: migratedCount };
}
