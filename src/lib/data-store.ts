import { Profile, ProfileSummary } from "@/types";
import { fixUpGauges } from "./profile-utils";
import { toCamelCase, toPascalCase } from "./field-mapping";
import { getDb } from "./mongodb";
import { ClientSession } from "mongodb";

const COLLECTION = "profiles";

let profileIndexesEnsured = false;

function getOwnerIdConditions(ownerId: string): Record<string, string>[] {
  return [{ "Owner.Id": ownerId }, { "Owner.id": ownerId }];
}

async function ensureProfileIndexes() {
  if (profileIndexesEnsured) return;
  const db = await getDb();
  const col = db.collection(COLLECTION);
  await Promise.all([
    col.createIndex({ id: 1 }, { unique: true }),
    col.createIndex({ "Owner.Id": 1 }),
    col.createIndex({ IsPublished: 1, LastUpdated: -1 }),
  ]);
  profileIndexesEnsured = true;
}

/**
 * Exported initialiser — called at startup via src/lib/init.ts so that
 * indexes are created once rather than lazily before each operation.
 */
export async function initProfileStore(): Promise<void> {
  await ensureProfileIndexes();
}

export interface ProfilesQueryParams {
  type?: number;
  engines?: number;
  search?: string;
  owner?: string;
  drafts?: boolean;
  page?: number;
  limit?: number;
}

export interface PaginatedProfiles {
  profiles: ProfileSummary[];
  total: number;
  page: number;
  limit: number;
}

export async function getAllProfiles(params: ProfilesQueryParams = {}): Promise<PaginatedProfiles> {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));

  const andConditions: Record<string, unknown>[] = [];

  if (params.owner) {
    if (params.drafts) {
      andConditions.push({ IsPublished: false });
      andConditions.push({ $or: getOwnerIdConditions(params.owner) });
    } else {
      andConditions.push({ $or: [{ IsPublished: true }, ...getOwnerIdConditions(params.owner)] });
    }
  } else {
    andConditions.push({ IsPublished: true });
  }

  if (params.type !== undefined) andConditions.push({ AircraftType: params.type });
  if (params.engines !== undefined) andConditions.push({ Engines: params.engines });

  if (params.search?.trim()) {
    for (const term of params.search.trim().split(/[\s,]+/).filter(Boolean)) {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      andConditions.push({
        $or: [
          { Name: { $regex: escapedTerm, $options: "i" } },
          { "Owner.Name": { $regex: escapedTerm, $options: "i" } },
        ],
      });
    }
  }

  const filter = andConditions.length === 0 ? {} : andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

  const projection = {
    _id: 0,
    id: 1,
    Owner: 1,
    LastUpdated: 1,
    Name: 1,
    AircraftType: 1,
    Engines: 1,
    IsPublished: 1,
    Notes: 1,
  };

  const [docs, total] = await Promise.all([
    db
      .collection(COLLECTION)
      .find(filter, { projection })
      .sort({ LastUpdated: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    db.collection(COLLECTION).countDocuments(filter),
  ]);

  return {
    profiles: docs.map((d) => toCamelCase<ProfileSummary>(d)),
    total,
    page,
    limit,
  };
}

export async function getProfile(id: string): Promise<Profile | null> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ id }, { projection: { _id: 0 } });

  if (!doc) return null;

  const profile = toCamelCase<Profile>(doc);
  fixUpGauges(profile);
  return profile;
}

export async function upsertProfile(id: string, profile: Profile): Promise<boolean> {
  const db = await getDb();

  profile.id = id;
  profile.lastUpdated = new Date().toISOString();

  const doc = toPascalCase<Record<string, unknown>>(profile);
  // Preserve lowercase `id` in the document
  doc.id = id;

  const result = await db.collection(COLLECTION).updateOne(
    { id },
    { $set: doc },
    { upsert: true }
  );

  return result.upsertedCount === 1;
}

export async function deleteProfile(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection(COLLECTION).deleteOne({ id });
  return result.deletedCount === 1;
}

/**
 * Updates the Owner.Id and Owner.Name on all profiles matching the old owner ID.
 * Used during Microsoft account → local account conversion.
 * Returns the number of modified profiles.
 */
export async function updateProfileOwner(
  oldOwnerId: string,
  newOwnerId: string,
  newOwnerName: string,
  session?: ClientSession
): Promise<number> {
  const db = await getDb();
  const result = await db.collection(COLLECTION).updateMany(
    { $or: getOwnerIdConditions(oldOwnerId) },
    {
      $set: { "Owner.Id": newOwnerId, "Owner.Name": newOwnerName },
      $unset: { "Owner.id": "" },
    },
    { session }
  );
  return result.modifiedCount;
}
