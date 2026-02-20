/**
 * Migration script: imports all JSON profile files from /data into MongoDB.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-mongo.ts
 *
 * Environment variables (optional – defaults shown):
 *   MONGODB_URI=mongodb://localhost:27017
 *   MONGODB_DB=simionic
 */

import { MongoClient } from "mongodb";
import { promises as fs } from "fs";
import path from "path";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const MONGODB_DB = process.env.MONGODB_DB ?? "simionic";
const DATA_DIR = path.join(__dirname, "..", "data");
const COLLECTION = "profiles";

async function main() {
  console.log(`Connecting to MongoDB at ${MONGODB_URI} ...`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const db = client.db(MONGODB_DB);
  const collection = db.collection(COLLECTION);

  // Read all JSON files
  const files = (await fs.readdir(DATA_DIR)).filter((f) => f.endsWith(".json"));
  console.log(`Found ${files.length} JSON files in ${DATA_DIR}`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
      const profile = JSON.parse(raw);

      // Use the profile's `id` field as the lookup key
      const id = profile.id ?? path.basename(file, ".json");
      profile.id = id;

      await collection.updateOne({ id }, { $set: profile }, { upsert: true });
      imported++;
    } catch (err) {
      console.error(`  Error importing ${file}:`, err);
      errors++;
    }
  }

  // Create an index on the `id` field for fast lookups
  await collection.createIndex({ id: 1 }, { unique: true });
  console.log(`Created unique index on { id: 1 }`);

  console.log(
    `\nDone! Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`
  );

  await client.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
