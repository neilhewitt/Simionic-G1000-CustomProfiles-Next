const argon2 = require("argon2");
const { MongoClient } = require("mongodb");
const { randomUUID } = require("crypto");

async function main() {
  const hash = await argon2.hash("P0temkin", { type: argon2.argon2id });
  const client = new MongoClient("mongodb://localhost:27017");
  await client.connect();
  const db = client.db("simionic");

  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("users").createIndex({ ownerId: 1 });

  await db.collection("users").updateOne(
    { email: "neil.hewitt@gmail.com" },
    {
      $set: {
        email: "neil.hewitt@gmail.com",
        name: "Neil Hewitt",
        passwordHash: hash,
        ownerId: randomUUID(),
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  const user = await db.collection("users").findOne({ email: "neil.hewitt@gmail.com" });
  console.log("User created:", JSON.stringify(user, null, 2));
  await client.close();
}

main().catch(console.error);
