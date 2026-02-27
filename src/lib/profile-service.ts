import { Profile } from "@/types";
import { getProfile, upsertProfile, deleteProfile } from "./data-store";
import { profileSchema } from "./profile-schema";

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUUID(id: string): void {
  if (!UUID_REGEX.test(id)) {
    throw new ValidationError("Invalid profile ID");
  }
}

export async function getProfileById(id: string): Promise<Profile> {
  validateUUID(id);
  const profile = await getProfile(id);
  if (!profile) {
    throw new NotFoundError("Profile not found");
  }
  return profile;
}

export async function saveProfile(
  id: string,
  body: unknown,
  ownerId: string,
  ownerName: string | null
): Promise<void> {
  validateUUID(id);

  const result = profileSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0].message);
  }
  const profile = result.data as Profile;

  const existing = await getProfile(id);
  if (existing && existing.Owner?.Id !== ownerId) {
    throw new ForbiddenError();
  }

  profile.Owner = { Id: ownerId, Name: ownerName };
  await upsertProfile(id, profile);
}

export async function deleteProfileById(
  id: string,
  ownerId: string
): Promise<void> {
  validateUUID(id);

  const existing = await getProfile(id);
  if (!existing) {
    throw new NotFoundError("Profile not found");
  }
  if (existing.Owner?.Id !== ownerId) {
    throw new ForbiddenError();
  }

  const deleted = await deleteProfile(id);
  if (!deleted) {
    throw new NotFoundError("Profile not found");
  }
}
