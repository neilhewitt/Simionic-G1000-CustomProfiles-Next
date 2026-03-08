/**
 * Playwright UI tests — Auth-gated pages (Create & Import)
 *
 * AC-UI-08: Create — Requires Auth
 *   Unauthenticated visitors navigating to /create see a sign-in prompt
 *   (the implementation shows a message with a sign-in link rather than a
 *   hard redirect, but the effect is the same: no profile creation UI is shown).
 *
 * AC-UI-09: Import — Requires Auth
 *   Same behaviour for /import.
 */
import { test, expect } from "@playwright/test";
import { mockUnauthenticated, mockAuthenticated, OWNER_ID } from "./helpers";

test.describe("AC-UI-08: Create page requires authentication", () => {
  test("AC-UI-08: unauthenticated visitor on /create sees a sign-in prompt, not the creation form", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/create");

    // The sign-in link is shown instead of the profile creation UI
    await expect(page.getByRole("link", { name: /sign\s*in|log\s*in|here/i }).first()).toBeVisible({ timeout: 10_000 });

    // The profile name input should NOT be visible
    await expect(page.getByRole("textbox")).not.toBeVisible();
  });

  test("AC-UI-08: authenticated user on /create sees the profile creation form", async ({ page }) => {
    await mockAuthenticated(page, { name: "Alice", email: "alice@example.com", ownerId: OWNER_ID });
    await page.goto("/create");

    // The profile name input should be visible for authenticated users
    await expect(page.getByRole("textbox")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /create/i })).toBeVisible();
  });
});

test.describe("AC-UI-09: Import page requires authentication", () => {
  test("AC-UI-09: unauthenticated visitor on /import sees a sign-in prompt, not the file upload", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/import");

    // A sign-in link is shown instead of the file upload UI
    await expect(page.getByRole("link", { name: /sign\s*in|log\s*in|here/i }).first()).toBeVisible({ timeout: 10_000 });

    // The file input should NOT be visible
    await expect(page.locator('input[type="file"]')).not.toBeVisible();
  });

  test("AC-UI-09: authenticated user on /import sees the file upload form", async ({ page }) => {
    await mockAuthenticated(page, { name: "Alice", email: "alice@example.com", ownerId: OWNER_ID });
    await page.goto("/import");

    // File upload input should be present for authenticated users
    await expect(page.locator('input[type="file"]')).toBeVisible({ timeout: 10_000 });
  });
});
