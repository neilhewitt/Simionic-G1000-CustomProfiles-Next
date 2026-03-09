/**
 * Playwright UI tests — Authentication forms
 *
 * AC-UI-13: Registration Page — Validates Client Side
 *   When the form is submitted with an empty name, an error message is shown
 *   without navigating away.
 *
 * AC-UI-14: Sign-In Page — Redirects After Success
 *   When the user signs in successfully they are redirected to the home page.
 */
import { test, expect } from "@playwright/test";
import { mockUnauthenticated, mockCredentialsAuthFlow, OWNER_ID } from "./helpers";

test.describe("AC-UI-13: Registration page — client-side validation", () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticated(page);
  });

  test("AC-UI-13: submitting with a short password shows a client-side error without navigating away", async ({ page }) => {
    await page.goto("/auth/register");

    // Fill in the form with a password that is too short (< 8 chars)
    await page.getByLabel("Display name").fill("Alice");
    await page.getByLabel("Email address").fill("alice@example.com");
    await page.getByLabel("Password").first().fill("short"); // < 8 chars
    await page.getByLabel("Confirm password").fill("short");
    await page.getByRole("button", { name: /create account/i }).click();

    // A client-side error message should appear in the same page
    await expect(page.locator(".alert.alert-danger")).toContainText(/8 characters/i, { timeout: 5_000 });
    // URL should not have changed
    expect(page.url()).toContain("/auth/register");
  });

  test("AC-UI-13: submitting with mismatched passwords shows a client-side error", async ({ page }) => {
    await page.goto("/auth/register");

    await page.getByLabel("Display name").fill("Alice");
    await page.getByLabel("Email address").fill("alice@example.com");
    await page.getByLabel("Password").first().fill("ValidPass1!");
    await page.getByLabel("Confirm password").fill("DifferentPass1!");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.locator(".alert.alert-danger")).toContainText(/do not match/i, { timeout: 5_000 });
    expect(page.url()).toContain("/auth/register");
  });

  test("AC-UI-13: registration page renders the form with all expected fields", async ({ page }) => {
    await page.goto("/auth/register");

    await expect(page.getByLabel("Display name")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password").first()).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });
});

test.describe("AC-UI-14: Sign-in page — redirects after success", () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticated(page);
    await mockCredentialsAuthFlow(page);
  });

  test("AC-UI-14: after a successful sign-in the user is redirected away from /auth/signin", async ({ page }) => {
    // Mock the NextAuth credentials sign-in endpoint to return a success redirect
    await page.route("**/api/auth/callback/credentials**", async (route) => {
      // Simulate a successful sign-in response that redirects to the callback URL
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "http://localhost:3000/" }),
      });
    });

    // Also mock the session endpoint to return an authenticated session AFTER sign-in
    // (the page will re-fetch the session once redirected)
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { name: "Alice", email: "alice@example.com", image: null },
          expires: "2099-01-01T00:00:00.000Z",
          ownerId: OWNER_ID,
        }),
      });
    });

    await page.goto("/auth/signin");
    await page.getByLabel("Email address").fill("alice@example.com");
    await page.getByLabel("Password").fill("Secure1234!");
    await page.getByRole("button", { name: /sign in/i }).click();

    // After a successful sign-in, the user should be redirected away from /auth/signin
    await page.waitForURL((url) => !url.pathname.includes("/auth/signin"), { timeout: 10_000 });
    expect(page.url()).not.toContain("/auth/signin");
  });

  test("AC-UI-14: sign-in page renders with Email and Password fields", async ({ page }) => {
    await page.goto("/auth/signin");

    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("AC-UI-14: wrong credentials shows an error message without redirecting", async ({ page }) => {
    // Mock credentials endpoint to return an error
    await page.route("**/api/auth/callback/credentials**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "http://localhost:3000/auth/signin?error=CredentialsSignin" }),
      });
    });

    await page.goto("/auth/signin");
    await page.getByLabel("Email address").fill("wrong@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.locator(".alert.alert-danger")).toContainText(/invalid email or password/i, { timeout: 5_000 });
    expect(page.url()).toContain("/auth/signin");
  });
});
