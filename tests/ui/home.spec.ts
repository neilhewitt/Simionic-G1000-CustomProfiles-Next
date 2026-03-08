/**
 * Playwright UI tests — Home page
 *
 * AC-UI-01: Home Page — Renders Without Auth
 *   Given a visitor not signed in
 *   When they load /
 *   Then the page renders successfully with a hero section and links to Browse and Sign In.
 */
import { test, expect } from "@playwright/test";
import { mockUnauthenticated } from "./helpers";

test.describe("AC-UI-01: Home page", () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticated(page);
  });

  test("renders without auth — shows hero headline", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("G1000");
  });

  test("renders without auth — shows Browse link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /browse/i }).first()).toBeVisible();
  });

  test("renders without auth — shows Sign In / Log in link", async ({ page }) => {
    await page.goto("/");
    // The page itself links to Browse, and the navbar has a Log in link
    await expect(page.getByRole("link", { name: /log\s*in|sign\s*in/i }).first()).toBeVisible();
  });

  test("page title is set correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/G1000/i);
  });
});
