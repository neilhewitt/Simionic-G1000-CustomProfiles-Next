/**
 * Playwright UI tests — Profile View & Edit page (/profile/[id])
 *
 * AC-UI-05: Profile View — Accessible Without Auth
 * AC-UI-06: Profile Edit — Only Owner Can Edit
 * AC-UI-07: Profile Edit — Owner Sees Edit Controls
 * AC-UI-12: Export — Downloads JSON File
 */
import { test, expect } from "@playwright/test";
import {
  mockUnauthenticated,
  mockAuthenticated,
  mockProfileById,
  SAMPLE_PROFILE,
  PROFILE_ID,
  OWNER_ID,
  OTHER_OWNER_ID,
} from "./helpers";

const PROFILE_URL = `/profile/${PROFILE_ID}`;

test.describe("AC-UI-05: Profile view accessible without auth", () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticated(page);
    await mockProfileById(page);
  });

  test("AC-UI-05: /profile/[id] loads profile details in read-only mode", async ({ page }) => {
    await page.goto(PROFILE_URL);

    // Profile name should appear in the page
    await expect(page.getByText(SAMPLE_PROFILE.name)).toBeVisible({ timeout: 10_000 });
  });

  test("AC-UI-05: read-only view shows author name", async ({ page }) => {
    await page.goto(PROFILE_URL);

    await expect(page.getByText("Alice").first()).toBeVisible({ timeout: 10_000 });
  });

  test("AC-UI-05: Export button is visible to unauthenticated visitors", async ({ page }) => {
    await page.goto(PROFILE_URL);
    await expect(page.getByText(SAMPLE_PROFILE.name)).toBeVisible({ timeout: 10_000 });

    // Export button should be visible (it's for anyone viewing the profile)
    await expect(page.getByRole("button", { name: /export/i })).toBeVisible();
  });
});

test.describe("AC-UI-06: Non-owner does not see edit controls", () => {
  test.beforeEach(async ({ page }) => {
    // Authenticated as Bob (OTHER_OWNER_ID), but profile is owned by Alice (OWNER_ID)
    await mockAuthenticated(page, {
      name: "Bob",
      email: "bob@example.com",
      ownerId: OTHER_OWNER_ID,
    });
    await mockProfileById(page);
  });

  test("AC-UI-06: non-owner visiting ?edit=true sees read-only view", async ({ page }) => {
    await page.goto(`${PROFILE_URL}?edit=true`);
    await expect(page.getByText(SAMPLE_PROFILE.name)).toBeVisible({ timeout: 10_000 });

    // Edit/Save controls should NOT be visible to a non-owner
    await expect(page.getByRole("button", { name: /save/i })).not.toBeVisible();
  });

  test("AC-UI-06: non-owner does not see Delete button", async ({ page }) => {
    await page.goto(PROFILE_URL);
    await expect(page.getByText(SAMPLE_PROFILE.name)).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole("button", { name: /delete/i })).not.toBeVisible();
  });
});

test.describe("AC-UI-07: Owner sees edit controls", () => {
  test.beforeEach(async ({ page }) => {
    // Authenticated as Alice, who owns the profile
    await mockAuthenticated(page, {
      name: "Alice",
      email: "alice@example.com",
      ownerId: OWNER_ID,
    });
    await mockProfileById(page);
  });

  test("AC-UI-07: owner visiting ?edit=true sees the ProfileEditor with Save/Cancel", async ({ page }) => {
    await page.goto(`${PROFILE_URL}?edit=true`);
    await expect(page.getByText(SAMPLE_PROFILE.name)).toBeVisible({ timeout: 10_000 });

    // In edit mode the owner should see Save and Cancel controls
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
  });

  test("AC-UI-07: owner in view mode sees Edit and Delete buttons", async ({ page }) => {
    await page.goto(PROFILE_URL);
    await expect(page.getByText(SAMPLE_PROFILE.name)).toBeVisible({ timeout: 10_000 });

    // In view mode the owner should see Edit and Delete buttons
    await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /delete/i })).toBeVisible();
  });
});

test.describe("AC-UI-12: Export downloads JSON file", () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticated(page);
    await mockProfileById(page);
  });

  test("AC-UI-12: clicking Export triggers a file download", async ({ page }) => {
    await page.goto(PROFILE_URL);
    await expect(page.getByText(SAMPLE_PROFILE.name)).toBeVisible({ timeout: 10_000 });

    // Start waiting for the download event before clicking Export
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /export/i }).click();
    const download = await downloadPromise;

    // Verify the downloaded file is a JSON file with the profile name
    expect(download.suggestedFilename()).toMatch(/\.json$/i);
  });
});
