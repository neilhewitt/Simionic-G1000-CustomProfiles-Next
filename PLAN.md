# Fix Plan for CODE_REVIEW.md Open Issues

This document lists every open issue from `CODE_REVIEW.md`, ordered from highest to lowest severity, with enough context and step-by-step instructions for each to be tackled independently in a separate agent session.

> **How to use this plan:** Each numbered section below is a self-contained work item. Work through them in order (highest severity first). Mark the top-level checkbox when the fix has been completed and merged.

---

## Issue 1 — Rate Limiting on Auth Endpoints + Stronger Reset Token ✅

**CODE_REVIEW refs:** §1.2 (HIGH), §3.1 (HIGH)

**Problem:** The auth API routes (`register`, `forgot-password`, `reset-password`, `convert/request`, `convert/complete`) have no rate limiting. The 6-digit numeric reset code (900 000 values, 15-minute window) can be brute-forced in under a minute by an automated attacker.

**Files to change:**
- `src/app/api/auth/register/route.ts`
- `src/app/api/auth/forgot-password/route.ts`
- `src/app/api/auth/reset-password/route.ts`
- `src/app/api/auth/convert/request/route.ts`
- `src/app/api/auth/convert/complete/route.ts`
- `src/lib/token-store.ts` (reset code generation)
- `src/lib/rate-limit.ts` *(new file)*
- `src/app/auth/forgot-password/page.tsx` (UI: link-based flow replaces typed code)
- `src/app/auth/reset-password/page.tsx` (UI: accept token from URL query param)
- `package.json` (if adding a rate-limit library)

**Steps:**

- [x] **1a — Add rate-limiting utility.** Create `src/lib/rate-limit.ts` using an in-memory sliding-window approach (or install `rate-limiter-flexible` / `@upstash/ratelimit` if Redis is available). Export a `rateLimit(key: string, limit: number, windowMs: number)` function that returns `{ success: boolean; remaining: number }`. The key should typically be the client IP (`request.headers.get("x-forwarded-for") || request.ip`).
- [x] **1b — Apply rate limiting to all auth endpoints.** At the top of each `POST` handler above, call `rateLimit(ip, ...)`. Return `429 Too Many Requests` with a `Retry-After` header when the limit is exceeded. Recommended limits: `register` — 5 per 15 min per IP; `forgot-password` — 5 per 15 min per IP; `reset-password` — 10 per 15 min per IP; `convert/request` — 5 per 15 min per IP; `convert/complete` — 10 per 15 min per IP.
- [x] **1c — Replace 6-digit code with a long random token.** In `src/lib/token-store.ts`, change `createResetCode` to generate a `randomUUID()` (or `randomBytes(32).toString("hex")`) instead of `randomInt(100000, 999999)`. Store the SHA-256 hash as before. Return the raw token.
- [x] **1d — Update forgot-password email template** to include a clickable reset link (`${APP_URL}/auth/reset-password?token=<token>&email=<email>`) instead of a 6-digit code.
- [x] **1e — Update the reset-password page** (`src/app/auth/reset-password/page.tsx`) to read the token and email from URL search params and remove the "enter your 6-digit code" input field. The page should still show a new-password form and POST `{ email, token, password }` to the API.
- [x] **1f — Update `verifyResetCode`** to accept a token string of arbitrary length (no functional change needed if it already SHA-256 hashes the input).
- [x] **1g — Validate.** Manually test: rate limit triggers on repeated requests; reset link works end to end; old 6-digit code flow is removed.

---

## Issue 2 — Server-Side Pagination for Profile Listing ✅

**CODE_REVIEW ref:** §2.1 (HIGH)

**Problem:** `getAllProfiles()` fetches every published profile from MongoDB and returns them all in one API response. All filtering (type, engine count, search) is done client-side in the browser.

**Files to change:**
- `src/lib/data-store.ts` — `getAllProfiles()` → add query params, `.skip()`, `.limit()`
- `src/app/api/profiles/route.ts` — accept and forward query params
- `src/app/profiles/ProfileListContent.tsx` — paginated fetch + server-side filter params
- `src/components/ProfileFilters.tsx` — wire filter changes to API calls
- `src/lib/profile-utils.ts` — client-side filter functions may become unused

**Steps:**

- [x] **2a — Add query parameters to the API.** Modify `GET /api/profiles` to accept optional query parameters: `type` (0/1/2), `engines` (1/2), `search` (string), `owner` (ownerId), `drafts` (boolean), `page` (default 1), `limit` (default 20, max 100). Forward them to the data-store function.
- [x] **2b — Implement server-side filtering and pagination in `data-store.ts`.** Build the MongoDB filter object dynamically from the query parameters. Use `.skip((page - 1) * limit).limit(limit)` for pagination. Also run a parallel `.countDocuments(filter)` to return the total count.
- [x] **2c — Return paginated response shape.** The API response should be `{ profiles: ProfileSummary[], total: number, page: number, limit: number }` instead of a bare array.
- [x] **2d — Update `ProfileListContent.tsx`.** Replace the single `fetch("/api/profiles")` with a parameterised fetch that includes the current filter state. Add page navigation (Previous / Next buttons). Remove or reduce client-side filtering — the server now handles it.
- [x] **2e — Validate.** Test with different filter combinations and page numbers. Ensure backward compatibility if any other code calls `GET /api/profiles`.

---

## Issue 3 — Transaction-Free Idempotent Account Conversion Flow ✅

**CODE_REVIEW ref:** §2.2 (HIGH)

**Problem:** The conversion endpoint (`POST /api/auth/convert/complete`) performs three sequential database operations (`createUser`, `updateProfileOwner`, `markConversionTokenUsed`) without atomicity. A crash between steps can leave orphaned data.

**Solution implemented:** Transaction-free, idempotent, retriable conversion flow. No MongoDB replica set required.

**Invariants enforced:**
- **Unique index on `users.email`** — prevents duplicate accounts (was already present).
- **Unique index on `conversion_tokens.tokenHash`** — prevents duplicate tokens (upgraded from non-unique).
- **Idempotent user creation** — `createUserIdempotent()` catches duplicate-key errors and returns the existing user.
- **Idempotent profile migration** — `updateMany` is naturally idempotent; re-running when profiles are already migrated yields `modifiedCount === 0`.
- **Token marked used LAST** — only after user creation and migration succeed. Uses conditional atomic update (`{ used: false }` → `{ used: true }`).
- **Retry safety** — if the token is already `used`, the endpoint checks for the existing user and returns 200 "Account already converted."

**Files changed:**
- `src/app/api/auth/convert/complete/route.ts` — idempotent flow with contextual logging
- `src/lib/user-store.ts` — added `createUserIdempotent()` (catches duplicate key error 11000)
- `src/lib/token-store.ts` — added `findConversionToken()` (ignores `used` flag); `markConversionTokenUsed()` now returns `boolean` via conditional update; `tokenHash` index upgraded to unique

**Steps:**

- [x] **3a — Make conversion flow idempotent and retriable without MongoDB transactions.**
- [x] **3b — Add `createUserIdempotent()` to handle duplicate-key errors gracefully.**
- [x] **3c — Add `findConversionToken()` to look up tokens regardless of `used` status.**
- [x] **3d — Make `markConversionTokenUsed()` use conditional atomic update and return boolean.**
- [x] **3e — Ensure unique index on `conversion_tokens.tokenHash`.**
- [x] **3f — Mark token used only after user creation and profile migration succeed.**
- [x] **3g — Add contextual server-side logging (email, ownerId, migrated count).**

---

## Issue 4 — Delete Profile Functionality ✅

**CODE_REVIEW ref:** §4.1 (HIGH)

**Problem:** There is no way to delete a profile. The database accumulates draft and test profiles indefinitely.

**Files to change:**
- `src/lib/data-store.ts` — add `deleteProfile(id: string): Promise<boolean>`
- `src/app/api/profiles/[id]/route.ts` — add `DELETE` handler
- `src/app/profile/[id]/ProfilePageContent.tsx` — add delete button (visible to owner, edit mode)

**Steps:**

- [x] **4a — Add `deleteProfile` to the data store.** In `src/lib/data-store.ts`, add:
  ```ts
  export async function deleteProfile(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.collection(COLLECTION).deleteOne({ id });
    return result.deletedCount === 1;
  }
  ```
- [x] **4b — Add `DELETE` handler to the profile API route.** In `src/app/api/profiles/[id]/route.ts`, add a `DELETE` function that:
  1. Requires authentication (`getServerSession`).
  2. Validates the UUID format.
  3. Fetches the existing profile and verifies ownership (`profile.Owner.Id === session.ownerId`).
  4. Calls `deleteProfile(id)`.
  5. Returns `200 { success: true }` or `404` if not found.
- [x] **4c — Add a delete button to the profile page.** In `ProfilePageContent.tsx`, add a "Delete" button visible only to the profile owner (next to the Edit button, in the view-mode action bar). Clicking it should show a confirmation dialog. On confirmation, `fetch(`/api/profiles/${id}`, { method: "DELETE" })` and redirect to `/profiles`.
- [x] **4d — Validate.** Create a test profile, delete it, confirm it's gone from the list and the API returns 404.

---

## Issue 5 — CSRF Protection on Custom API Routes

**CODE_REVIEW ref:** §1.7 (MEDIUM)

**Problem:** Custom API routes under `src/app/api/auth/` have no CSRF protection beyond the `Content-Type: application/json` requirement.

**Files to change:**
- `src/middleware.ts` *(new file)* — Next.js middleware for Origin header verification
- Alternatively, create `src/lib/csrf.ts` as a utility and call it from each route

**Steps:**

- [ ] **5a — Create Next.js middleware for Origin verification.** Create `src/middleware.ts` that:
  1. Runs on all `POST`, `PUT`, `DELETE` requests to `/api/` routes.
  2. Reads the `Origin` header from the request.
  3. Compares it against the allowed origin (`process.env.APP_URL` or derived from `request.nextUrl.origin`).
  4. Returns `403 Forbidden` if the Origin is missing or doesn't match.
  5. Passes through for `GET`/`HEAD`/`OPTIONS` requests and for NextAuth's own routes (which have their own CSRF protection).
- [ ] **5b — Configure the middleware matcher.** Use Next.js middleware config to restrict to API routes:
  ```ts
  export const config = { matcher: ["/api/:path*"] };
  ```
- [ ] **5c — Validate.** Test that same-origin POST requests succeed and cross-origin POST requests are rejected. Verify NextAuth sign-in still works.

---

## Issue 6 — Server-Side Schema Validation on Profile Import

**CODE_REVIEW ref:** §1.10 (MEDIUM)

**Problem:** When importing a profile, the API validates only `Name` and `Notes` lengths. Arbitrary additional fields can be injected into the MongoDB document via the `$set` spread in `upsertProfile`.

**Files to change:**
- `src/lib/profile-schema.ts` *(new file)* — validation/stripping logic
- `src/app/api/profiles/[id]/route.ts` — apply validation before `upsertProfile`
- `package.json` — add `zod` (recommended) or implement manual validation

**Steps:**

- [ ] **6a — Install Zod.** Run `npm install zod`. (Or implement manual validation if adding a dependency is undesirable.)
- [ ] **6b — Define the Profile schema.** Create `src/lib/profile-schema.ts` with a Zod schema that mirrors the `Profile` type. Use `.strip()` to remove unknown fields. Key constraints:
  - `Name`: string, 1–200 chars
  - `Notes`: string or null, max 2000 chars
  - `AircraftType`: 0 | 1 | 2
  - `Engines`: 1 | 2
  - `Cylinders`: 4 | 6
  - `IsPublished`: boolean
  - All gauge fields: nested object matching `Gauge` shape
  - All numeric fields: `z.number()`
  - `Ranges` arrays: exactly 4 elements
  - `FlapsRange.Markings`: array of 6 (string | null)
  - `FlapsRange.Positions`: array of 6 (number | null)
  - `VSpeeds`: object with 9 numeric fields
- [ ] **6c — Apply validation in the POST handler.** In `src/app/api/profiles/[id]/route.ts`, replace the manual `Name`/`Notes` validation with:
  ```ts
  const result = profileSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }
  const profile = result.data; // unknown fields have been stripped
  ```
- [ ] **6d — Validate.** Test that a normal profile save/import works. Test that a request with extra fields has those fields stripped. Test that invalid data returns 400.

---

## Issue 7 — Numeric Input Handling (`Number(value) || 0` + `type="text"`)

**CODE_REVIEW refs:** §3.2 (MEDIUM), §4.4 (MEDIUM)

**Problem:** Numeric fields use `type="text"` and `Number(e.target.value) || 0`, which silently converts empty strings to `0` and doesn't provide a numeric keypad on mobile.

**Files to change:**
- `src/components/ProfileEditor.tsx`
- `src/components/GaugeDisplay.tsx`

**Steps:**

- [ ] **7a — Change all numeric `<input>` elements to `type="number"`.** In both `ProfileEditor.tsx` and `GaugeDisplay.tsx`, find every `<input type="text">` that feeds into a `Number(...)` conversion and change it to `type="number"`. Add `step="any"` where decimals are allowed (gauges with `AllowDecimals`), `step="1"` otherwise.
- [ ] **7b — Fix the `onChange` handler.** Replace `Number(e.target.value) || 0` with a handler that preserves empty state:
  ```ts
  const raw = e.target.value;
  const num = raw === "" ? 0 : Number(raw);
  if (!isNaN(num)) { update({ ... }); }
  ```
  This prevents `NaN` injection while still allowing the user to clear the field and type a new value.
- [ ] **7c — Validate.** Test that numeric fields accept valid numbers, reject non-numeric input, and handle clearing + re-typing gracefully. Test on a mobile viewport (Chrome DevTools device emulation) to verify the numeric keypad appears.

---

## Issue 8 — Move Profile Name Field to the Top of the Edit Form

**CODE_REVIEW ref:** §4.3 (MEDIUM)

**Problem:** The profile name input is at the very bottom of the page, below all gauge configuration. It should be near the top.

**Files to change:**
- `src/app/profile/[id]/ProfilePageContent.tsx`

**Steps:**

- [ ] **8a — Move the profile name field.** In `ProfilePageContent.tsx`, move the `<label>Profile name <input ...></label>` block from the bottom save bar (around lines 243–255) to just above the `<ProfileEditor>` component (around line 236), immediately after the author notes alert. Keep the save/cancel buttons at the bottom.
- [ ] **8b — Validate.** Visually confirm that the profile name appears near the top in both edit and view modes. Ensure save/cancel still works.

---

## Issue 9 — Array Index Used as React Key for Gauge Ranges

**CODE_REVIEW ref:** §3.5 (MEDIUM)

**Problem:** `GaugeDisplay.tsx` uses array index `i` as the React `key` for gauge range elements. While currently harmless (fixed-length arrays), it's a fragile pattern.

**Files to change:**
- `src/types/gauge.ts` — add `id` field to `GaugeRange`
- `src/lib/profile-utils.ts` — generate IDs in `createDefaultGauge`
- `src/components/GaugeDisplay.tsx` — use `range.id` as key

**Steps:**

- [ ] **9a — Add a stable `id` field to `GaugeRange`.** In `src/types/gauge.ts`, add `id: string;` to `GaugeRange`.
- [ ] **9b — Generate IDs when creating default gauges.** In `createDefaultGauge` (`profile-utils.ts`), assign `id: crypto.randomUUID()` to each range.
- [ ] **9c — Ensure existing profiles get IDs on load.** In `fixUpGauges` (`profile-utils.ts`), if a range has no `id`, assign one. This handles profiles loaded from the database that predate the change.
- [ ] **9d — Use `range.id` as the key.** In `GaugeDisplay.tsx`, replace `key={i}` with `key={range.id}` on both the `ColourIndicator` and the range value input `<div>`.
- [ ] **9e — Validate.** Confirm no React key warnings in the console. Confirm gauge editing still works correctly.

---

## Issue 10 — Service Layer (Refactor)

**CODE_REVIEW ref:** §2.3 (MEDIUM)

**Problem:** All business logic lives directly in API route handlers. This makes unit testing difficult and leads to duplicated patterns.

**Files to create:**
- `src/lib/profile-service.ts` *(new)*
- `src/lib/user-service.ts` *(new)*

**Files to change:**
- All API route handlers under `src/app/api/`

**Steps:**

- [ ] **10a — Create `src/lib/profile-service.ts`.** Extract business logic from `GET /api/profiles/[id]`, `POST /api/profiles/[id]`, and `DELETE /api/profiles/[id]` (once issue 4 is done) into service functions: `getProfileById(id)`, `saveProfile(id, profile, ownerId)`, `deleteProfile(id, ownerId)`. These functions handle ownership checks, validation, and data-store calls. They throw typed errors (e.g., `NotFoundError`, `ForbiddenError`) instead of returning HTTP responses.
- [ ] **10b — Create `src/lib/user-service.ts`.** Extract business logic from `register`, `forgot-password`, `reset-password`, and `convert/*` routes into service functions: `registerUser(name, email, password)`, `requestPasswordReset(email)`, `resetPassword(email, code, newPassword)`, `requestConversion(email)`, `completeConversion(token, email, name, password)`.
- [ ] **10c — Update route handlers to delegate to services.** Each route handler becomes a thin adapter: parse request, call service, map result to HTTP response.
- [ ] **10d — Validate.** All existing functionality works as before. The route handlers are now <20 lines each.

**Note:** This is a larger refactor. Consider doing it after the higher-priority security and functionality fixes are in place.

---

## Issue 11 — PascalCase → camelCase Field Name Migration

**CODE_REVIEW ref:** §2.4 (MEDIUM)

**Problem:** The `Profile` type uses PascalCase field names (inherited from C#), while the rest of the JS/TS codebase uses camelCase. This causes confusion.

**Files to change:**
- `src/types/profile.ts`, `src/types/gauge.ts` — rename all fields
- `src/lib/data-store.ts` — add mapping layer between MongoDB docs and TS types
- `src/lib/profile-utils.ts` — update all field references
- `src/lib/export.ts` — transform to PascalCase for export compatibility
- `src/components/ProfileEditor.tsx` — update all field references
- `src/components/GaugeDisplay.tsx` — update all field references
- `src/app/profile/[id]/ProfilePageContent.tsx` — update all field references
- `src/app/import/page.tsx` — transform from PascalCase on import
- `src/app/api/profiles/[id]/route.ts` — update field references
- MongoDB migration script or mapping layer

**Steps:**

- [ ] **11a — Define the camelCase types.** Rename all PascalCase fields in `Profile`, `ProfileSummary`, `Gauge`, `GaugeRange`, `OwnerInfo`, `VSpeeds`, `SettingRange`, `VacuumPSIRange`, `FlapsRange` to camelCase.
- [ ] **11b — Add a mapping layer in the data store.** In `data-store.ts`, add `toCamelCase(doc)` and `toPascalCase(profile)` functions that transform field names between MongoDB document format (PascalCase, for backward compat) and the TypeScript type (camelCase). Apply `toCamelCase` when reading and `toPascalCase` when writing.
- [ ] **11c — Update all component and utility references.** Find-and-replace all PascalCase field accesses throughout the codebase with camelCase equivalents.
- [ ] **11d — Update the export function.** In `src/lib/export.ts`, ensure the exported JSON uses PascalCase for compatibility with the Simionic iPad app.
- [ ] **11e — Update the import flow.** In `src/app/import/page.tsx`, transform imported PascalCase fields to camelCase after parsing.
- [ ] **11f — Validate.** All pages render correctly. Import/export round-trips produce identical results. MongoDB documents are still stored in PascalCase for backward compatibility.

**Note:** This is the largest refactor. Do it last. Consider a MongoDB migration script to rename fields in existing documents if backward compatibility isn't needed.

---

## Issue 12 — Dev Email Service Improvement

**CODE_REVIEW ref:** §2.6 (LOW)

**Problem:** The fake email service writes to `process.cwd()/email/`, which is fragile in serverless environments.

**Files to change:**
- `src/lib/email/fake-email-service.ts`

**Steps:**

- [ ] **12a — Remove filesystem writes.** Simplify the `FakeEmailService` to only `console.log` the email content (the file write is a bonus that nobody looks at). Alternatively, if file output is desired, write to `os.tmpdir()` instead of `process.cwd()`.
- [ ] **12b — (Optional) Add MailHog/Mailpit integration.** If the project wants a proper local SMTP server, update the `FakeEmailService` to send via SMTP to `localhost:1025` (the default MailHog port) instead of writing to disk. This lets developers use a real email UI.
- [ ] **12c — Validate.** Trigger a password reset in dev mode. Verify the email appears in console output (and in MailHog if configured).

---

## Issue 13 — NextAuth v4 → Auth.js v5 Migration

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

- [ ] **13a — Read the Auth.js v5 migration guide.** See https://authjs.dev/getting-started/migrating-to-v5.
- [ ] **13b — Install Auth.js v5.** `npm install next-auth@5`.
- [ ] **13c — Rewrite `auth.ts`.** Convert from `NextAuthOptions` export to the `NextAuth()` function API. Update callbacks for the v5 shape.
- [ ] **13d — Update the route handler.** Replace `[...nextauth]/route.ts` with the v5 handler pattern.
- [ ] **13e — Update all session consumers.** Replace `getServerSession(authOptions)` with `auth()`. Replace `useSession()` with the v5 equivalent if needed.
- [ ] **13f — Update type augmentations.** Adapt `next-auth.d.ts` for v5.
- [ ] **13g — Validate.** Sign in, sign out, register, reset password, create/edit/delete profiles — all auth-dependent flows still work.

**Note:** This is a significant migration. Do it in isolation after all other fixes.

---

## Issue 14 — `Profile.id` Discriminated Union

**CODE_REVIEW ref:** §3.8 (LOW)

**Problem:** `Profile.id` is `string | null`, which propagates null-checks throughout the save flow. A discriminated union would be more type-safe.

**Files to change:**
- `src/types/profile.ts`
- All files that reference `Profile.id`

**Steps:**

- [ ] **14a — Define discriminated union types.** In `profile.ts`:
  ```ts
  interface BaseProfile { /* all fields except id */ }
  interface NewProfile extends BaseProfile { id: null; }
  interface SavedProfile extends BaseProfile { id: string; }
  export type Profile = NewProfile | SavedProfile;
  ```
- [ ] **14b — Update consumers.** Use type narrowing (`if (profile.id === null)`) instead of null-checks. The save flow can use `profile is SavedProfile` type guards.
- [ ] **14c — Validate.** TypeScript compiles with no errors. All existing functionality works.

---

## Issue 15 — `ForkedFrom` Field: Implement or Remove

**CODE_REVIEW ref:** §4.5 (LOW)

**Problem:** `Profile.ForkedFrom` is defined and initialised as `null` but never displayed or set by any code.

**Files to change:**
- `src/types/profile.ts` — remove field (if not implementing fork)
- `src/lib/profile-utils.ts` — remove from `createDefaultProfile()`
- OR: implement a "Fork this profile" feature (larger scope)

**Steps:**

- [ ] **15a — Decide: implement or remove.** If forking is not planned, remove the field. If it is planned, implement a "Fork" button on the profile view page that copies the profile, sets `ForkedFrom` to the original profile's ID, and opens it in edit mode.
- [ ] **15b — If removing:** Delete the `ForkedFrom` field from `Profile` type and `createDefaultProfile()`. Search for any references and remove them.
- [ ] **15c — If implementing:** Add a "Fork" button, create the forked profile via `POST /api/profiles/[newId]` with `ForkedFrom` set, and display "Forked from: [link to original]" on the profile page.
- [ ] **15d — Validate.** No references to `ForkedFrom` remain (if removed) or the fork flow works end to end (if implemented).

---

## Issue 16 — Loading Skeleton for Profile List

**CODE_REVIEW ref:** §4.6 (LOW)

**Problem:** The profile list shows only `<h5>Loading...</h5>` while data is fetched.

**Files to change:**
- `src/app/profiles/ProfileListContent.tsx`
- `src/components/ProfileCardSkeleton.tsx` *(new file)*

**Steps:**

- [ ] **16a — Create a skeleton component.** Create `ProfileCardSkeleton.tsx` that renders a placeholder card with pulsing grey blocks matching the layout of `ProfileCard.tsx`.
- [ ] **16b — Show skeletons while loading.** In `ProfileListContent.tsx`, replace the `<h5>Loading...</h5>` with a grid of 6–8 `<ProfileCardSkeleton />` components. Use Bootstrap's `placeholder-glow` utility class or CSS `@keyframes` pulse animation.
- [ ] **16c — Validate.** Throttle the network in DevTools to see the skeleton in action. Confirm it transitions smoothly to real cards.

---

## Issue 17 — V-Speed Label Tooltips

**CODE_REVIEW ref:** §4.7 (LOW)

**Problem:** V-speed labels (`Vs0`, `Vs1`, etc.) are unfamiliar to non-pilots.

**Files to change:**
- `src/components/ProfileEditor.tsx`

**Steps:**

- [ ] **17a — Add `title` attributes to V-speed labels.** For each V-speed label in `ProfileEditor.tsx`, add a `title` attribute:
  - `Vs0` → "Stall speed in landing configuration (flaps down)"
  - `Vs1` → "Stall speed in clean configuration (flaps up)"
  - `Vfe` → "Maximum flap extended speed"
  - `Vno` → "Maximum structural cruising speed"
  - `Vne` → "Never exceed speed"
  - `Vglide` → "Best glide speed"
  - `Vr` → "Rotation speed"
  - `Vx` → "Best angle of climb speed"
  - `Vy` → "Best rate of climb speed"
- [ ] **17b — (Optional) Use `<abbr>` elements** instead of bare labels for better semantic HTML.
- [ ] **17c — Validate.** Hover over each label and confirm the tooltip appears.

---

## Issue 18 — User-Friendly Error Messages

**CODE_REVIEW ref:** §4.8 (LOW)

**Problem:** Raw `err.message` from network fetches is shown directly to users in several places.

**Files to change:**
- `src/app/profile/[id]/ProfilePageContent.tsx`
- `src/app/profiles/ProfileListContent.tsx`
- Any other component that displays `err.message` or `error` state

**Steps:**

- [ ] **18a — Create an error message utility.** Create `src/lib/error-utils.ts` with a function:
  ```ts
  export function getUserFriendlyError(err: unknown): string {
    if (err instanceof Error) {
      console.error(err); // log the real error for debugging
    }
    return "Something went wrong. Please try again later.";
  }
  ```
- [ ] **18b — Replace raw error messages.** In `ProfilePageContent.tsx`, `ProfileListContent.tsx`, and any other components, replace `setError(err.message)` with `setError(getUserFriendlyError(err))`. Keep the technical error in `console.error` for debugging.
- [ ] **18c — Validate.** Trigger errors (e.g., disconnect network, malformed data) and confirm users see friendly messages while the console still has the technical details.

---

## Summary: Recommended Order of Execution

| Priority | Issue | Severity | Scope |
|----------|-------|----------|-------|
| 1 | Rate Limiting + Reset Token | HIGH | Security |
| 2 | Pagination | HIGH | Architecture |
| 3 | Database Transactions | HIGH | Architecture |
| 4 | Delete Functionality | HIGH | Feature |
| 5 | CSRF Protection | MEDIUM | Security |
| 6 | Schema Validation on Import | MEDIUM | Security |
| 7 | Numeric Input Handling | MEDIUM | Bug fix |
| 8 | Profile Name Position | MEDIUM | Usability |
| 9 | React Key Fix | MEDIUM | Code quality |
| 10 | Service Layer | MEDIUM | Refactor |
| 11 | PascalCase Migration | MEDIUM | Refactor |
| 12 | Dev Email Service | LOW | DX |
| 13 | NextAuth v5 Migration | LOW | Tech debt |
| 14 | Discriminated Union for Profile.id | LOW | Type safety |
| 15 | ForkedFrom Field | LOW | Cleanup |
| 16 | Loading Skeleton | LOW | Usability |
| 17 | V-Speed Tooltips | LOW | Usability |
| 18 | Error Messages | LOW | Usability |
