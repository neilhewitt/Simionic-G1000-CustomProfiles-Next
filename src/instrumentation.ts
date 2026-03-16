/**
 * Next.js custom instrumentation hook.
 * This file is called once at server startup (Node.js runtime only).
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getAppUrlWarning } = await import("./lib/app-url");
    const { initializeDb } = await import("./lib/init");

    const appUrlWarning = getAppUrlWarning();
    if (appUrlWarning) {
      console.warn(appUrlWarning);
    }

    await initializeDb();
  }
}
