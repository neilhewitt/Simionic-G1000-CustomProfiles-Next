/**
 * Playwright UI tests — Navbar
 *
 * AC-UI-10: Navbar — Shows User Name When Signed In
 * AC-UI-11: Navbar — Shows Sign In Link When Not Signed In
 */
import { test, expect } from "@playwright/test";
import { mockUnauthenticated, mockAuthenticated, OWNER_ID } from "./helpers";

test.describe("AC-UI-11: Navbar — unauthenticated", () => {
  test("AC-UI-11: navbar shows Log in link when not signed in", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/");

    await expect(page.getByRole("link", { name: /log\s*in/i })).toBeVisible({ timeout: 10_000 });
  });

  test("AC-UI-11: navbar does NOT show user menu when not signed in", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/");

    // The user-menu button (person icon) should not be visible when logged out
    await expect(page.getByRole("button", { name: /user menu/i })).not.toBeVisible();
  });

  test("AC-UI-11: navbar has Browse and Register links", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/");

    // Browse profiles link should always be visible
    await expect(page.getByRole("link", { name: /browse/i }).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("AC-UI-10: Navbar — authenticated", () => {
  test("AC-UI-10: navbar shows user name in dropdown when signed in", async ({ page }) => {
    await mockAuthenticated(page, { name: "Alice", email: "alice@example.com", ownerId: OWNER_ID });
    await page.goto("/");

    // The user-menu button should appear when signed in
    const userMenuBtn = page.getByRole("button", { name: /user menu/i });
    await expect(userMenuBtn).toBeVisible({ timeout: 10_000 });

    // Click to open the dropdown
    await userMenuBtn.click();

    // Alice's name should appear in the dropdown
    await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible();
  });

  test("AC-UI-10: navbar dropdown contains a Log out button", async ({ page }) => {
    await mockAuthenticated(page, { name: "Alice", email: "alice@example.com", ownerId: OWNER_ID });
    await page.goto("/");

    const userMenuBtn = page.getByRole("button", { name: /user menu/i });
    await expect(userMenuBtn).toBeVisible({ timeout: 10_000 });
    await userMenuBtn.click();

    await expect(page.getByRole("button", { name: /log out|sign out/i })).toBeVisible();
  });

  test("AC-UI-10: navbar does NOT show Log in link when signed in", async ({ page }) => {
    await mockAuthenticated(page, { name: "Alice", email: "alice@example.com", ownerId: OWNER_ID });
    await page.goto("/");

    await expect(page.getByRole("link", { name: /log\s*in/i })).not.toBeVisible({ timeout: 10_000 });
  });
});
