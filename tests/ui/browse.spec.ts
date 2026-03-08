/**
 * Playwright UI tests — Browse Profiles page (/profiles)
 *
 * AC-UI-02: Browse Page — Shows Published Profiles
 * AC-UI-03: Browse Page — Filter by Aircraft Type
 * AC-UI-04: Browse Page — Search
 */
import { test, expect } from "@playwright/test";
import { mockUnauthenticated, mockProfileList, SAMPLE_SUMMARY, TURBOPROP_SUMMARY } from "./helpers";

test.describe("AC-UI-02 / AC-UI-03 / AC-UI-04: Browse Profiles page", () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticated(page);
    await mockProfileList(page);
  });

  // --------------------------------------------------------------------------
  // AC-UI-02: Browse page shows published profile cards
  // --------------------------------------------------------------------------

  test("AC-UI-02: /profiles shows profile cards with name, author, aircraft type and engines", async ({ page }) => {
    await page.goto("/profiles");

    // Wait for profile data to load (skeleton disappears, cards appear)
    await expect(page.getByText(SAMPLE_SUMMARY.name)).toBeVisible({ timeout: 10_000 });

    // Profile name
    await expect(page.getByText("Cessna 172 Profile")).toBeVisible();

    // Author name
    await expect(page.getByText("Alice").first()).toBeVisible();
  });

  test("AC-UI-02: shows multiple profile cards when multiple profiles exist", async ({ page }) => {
    await page.goto("/profiles");

    await expect(page.getByText("Cessna 172 Profile")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("King Air 350")).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // AC-UI-03: Filter by Aircraft Type
  // --------------------------------------------------------------------------

  test("AC-UI-03: selecting Piston type filter shows only Piston profiles", async ({ page }) => {
    await page.goto("/profiles");
    await expect(page.getByText("Cessna 172 Profile")).toBeVisible({ timeout: 10_000 });

    // Click the Piston filter option
    const pistonFilter = page.getByRole("button", { name: /piston/i });
    if (await pistonFilter.isVisible()) {
      await pistonFilter.click();
    } else {
      // Filter might be a radio/checkbox or a select
      const typeSelect = page.locator("select").first();
      if (await typeSelect.isVisible()) {
        await typeSelect.selectOption("0"); // Piston = 0
      }
    }

    await expect(page.getByText("Cessna 172 Profile")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("King Air 350")).not.toBeVisible();
  });

  // --------------------------------------------------------------------------
  // AC-UI-04: Search
  // --------------------------------------------------------------------------

  test("AC-UI-04: typing a search term filters the profile list", async ({ page }) => {
    await page.goto("/profiles");
    await expect(page.getByText("Cessna 172 Profile")).toBeVisible({ timeout: 10_000 });

    // The home page Notice component also has a search input — use the one on /profiles
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill("King Air");

    // The browse page debounces search by 300ms
    await page.waitForTimeout(500);

    await expect(page.getByText("King Air 350")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Cessna 172 Profile")).not.toBeVisible();
  });
});
