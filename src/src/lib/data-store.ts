import { Profile, ProfileSummary } from "@/types";
import { fixUpGauges } from "./profile-utils";
import { getDb } from "./mongodb";

const COLLECTION = "profiles";

export async function getAllProfiles(): Promise<ProfileSummary[]> {
  const db = await getDb();
  const docs = await db
    .collection(COLLECTION)
    .find(
      {},
      {
        projection: {
          _id: 0,
          id: 1,
          Owner: 1,
          LastUpdated: 1,
          Name: 1,
          AircraftType: 1,
          Engines: 1,
          IsPublished: 1,
          Notes: 1,
        },
      }
    )
    .toArray();

  return docs as unknown as ProfileSummary[];
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
