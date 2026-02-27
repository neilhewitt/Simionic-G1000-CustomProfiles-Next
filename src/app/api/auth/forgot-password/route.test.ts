import test from "node:test";
import assert from "node:assert/strict";

test("forgot-password keeps zero-disclosure 200 shape when throttled", async () => {
  process.env.MONGODB_URI ??= "mongodb://localhost:27017";
  process.env.MONGODB_DB ??= "simionic-test";
  process.env.NODE_ENV = "development";
  const { POST } = await import("./route");
  const { default: mongoClientPromise } = await import("@/lib/mongodb");
  void mongoClientPromise.catch(() => undefined);
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;

  for (let i = 0; i < 5; i++) {
    const response = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({}),
      }) as never
    );
    assert.equal(response.status, 200);
  }

  const throttled = await POST(
    new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({}),
    }) as never
  );

  assert.equal(throttled.status, 200);
  assert.equal(throttled.headers.get("retry-after"), "900");
  assert.deepEqual(await throttled.json(), {
    message: "If an account exists, a reset link has been sent.",
  });
});
