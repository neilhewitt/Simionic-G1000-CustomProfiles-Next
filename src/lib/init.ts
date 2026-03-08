import { initUserStore } from "./user-store";
import { initTokenStore } from "./token-store";
import { initProfileStore } from "./data-store";

/**
 * Ensures all MongoDB indexes are created at application startup.
 * Called from src/instrumentation.ts so that index creation happens once,
 * predictably, rather than lazily before each database operation.
 */
export async function initializeDb(): Promise<void> {
  await Promise.all([initUserStore(), initTokenStore(), initProfileStore()]);
}
