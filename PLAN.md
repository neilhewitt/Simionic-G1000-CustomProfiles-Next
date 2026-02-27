# Fix Plan for CODE_REVIEW.md Open Issues

This document lists every open issue from `CODE_REVIEW.md`, ordered from highest to lowest severity, with enough context and step-by-step instructions for each to be tackled independently in a separate agent session.

> **How to use this plan:** Each numbered section below is a self-contained work item. Work through them in order (highest severity first). Mark the top-level checkbox when the fix has been completed and merged.

---

## Issue 1 — NextAuth v4 → Auth.js v5 Migration

**CODE_REVIEW ref:** §2.7 (LOW)

**Problem:** The project uses NextAuth v4 with Next.js 16. Auth.js v5 is the current version designed for the App Router.

**Files to change:**
- `package.json` — replace `next-auth` with `next-auth@5` / `@auth/core`
- `src/lib/auth.ts` — rewrite to Auth.js v5 API
- `src/app/api/auth/[...nextauth]/route.ts` — update to v5 handler
- `src/types/next-auth.d.ts` — update type augmentation
- `src/components/AuthProvider.tsx` — update if session handling changes
- All files using `useSession`, `getServerSession`, `getSession`

**Steps:**

- [ ] **1a — Read the Auth.js v5 migration guide.** See https://authjs.dev/getting-started/migrating-to-v5.
- [ ] **1b — Install Auth.js v5.** `npm install next-auth@5`.
- [ ] **1c — Rewrite `auth.ts`.** Convert from `NextAuthOptions` export to the `NextAuth()` function API. Update callbacks for the v5 shape.
- [ ] **1d — Update the route handler.** Replace `[...nextauth]/route.ts` with the v5 handler pattern.
- [ ] **1e — Update all session consumers.** Replace `getServerSession(authOptions)` with `auth()`. Replace `useSession()` with the v5 equivalent if needed.
- [ ] **1f — Update type augmentations.** Adapt `next-auth.d.ts` for v5.
- [ ] **1g — Validate.** Sign in, sign out, register, reset password, create/edit/delete profiles — all auth-dependent flows still work.

**Note:** This is a significant migration. Do it in isolation after all other fixes.
