/**
 * Next.js custom instrumentation hook.
 * This file is called once at server startup (Node.js runtime only).
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeDb } = await import("./lib/init");
    await initializeDb();
  }
}
