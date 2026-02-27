import { Profile, ProfileSummary } from "@/types";
import { fixUpGauges } from "./profile-utils";
import { getDb } from "./mongodb";

const COLLECTION = "profiles";

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
      andConditions.push({ IsPublished: false, "Owner.Id": params.owner });
    } else {
      andConditions.push({ $or: [{ IsPublished: true }, { "Owner.Id": params.owner }] });
    }
  } else {
    andConditions.push({ IsPublished: true });
  }

  if (params.type !== undefined) andConditions.push({ AircraftType: params.type });
  if (params.engines !== undefined) andConditions.push({ Engines: params.engines });

  if (params.search?.trim()) {
    for (const term of params.search.trim().split(/[\s,]+/).filter(Boolean)) {
      andConditions.push({
        $or: [
          { Name: { $regex: term, $options: "i" } },
          { "Owner.Name": { $regex: term, $options: "i" } },
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
    profiles: docs as unknown as ProfileSummary[],
    total,
    page,
    limit,
  };
}

export async function getProfile(id: string): Promise<Profile | null> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ id }, { projection: { _id: 0 } });

  if (!doc) return null;

  const profile = doc as unknown as Profile;
  fixUpGauges(profile);
  return profile;
}

export async function upsertProfile(id: string, profile: Profile): Promise<void> {
  const db = await getDb();

  profile.id = id;
  profile.LastUpdated = new Date().toISOString();

  await db.collection(COLLECTION).updateOne(
    { id },
    { $set: profile },
    { upsert: true }
  );
}

/**
 * Updates the Owner.Id and Owner.Name on all profiles matching the old owner ID.
 * Used during Microsoft account → local account conversion.
 * Returns the number of modified profiles.
 */
export async function updateProfileOwner(
  oldOwnerId: string,
  newOwnerId: string,
  newOwnerName: string
): Promise<number> {
  const db = await getDb();
  const result = await db.collection(COLLECTION).updateMany(
    { "Owner.Id": oldOwnerId },
    { $set: { "Owner.Id": newOwnerId, "Owner.Name": newOwnerName } }
  );
  return result.modifiedCount;
}
