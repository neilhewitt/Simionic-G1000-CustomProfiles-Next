# Remediation Plan for CODE_REVIEW.md Issues

**Created:** February 2026
**Source:** CODE_REVIEW.md (February 2026 review)
**Ordering:** By severity — HIGH first, then MEDIUM, then LOW

---

## HIGH Severity

### 1. MongoDB Regex Injection via Search (Issue 1.1 — Security)

**File:** `src/lib/data-store.ts` lines 46–51

**Problem:** User-supplied search terms are interpolated directly into MongoDB `$regex` queries without escaping regex metacharacters. This enables unexpected query behaviour (e.g. searching `C++` fails) and potential ReDoS attacks via crafted patterns.

**Fix:**
- Add a `escapeRegex` utility function that escapes all regex special characters: `term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`
- Apply `escapeRegex()` to each search term before passing it to the `$regex` operator in the `searchProfiles` function.

**Verification:** Write a test confirming that search terms containing regex metacharacters (`.*+?^${}()|[]\`) are escaped and do not cause errors or unexpected matches.

---

### 2. CSRF Middleware NextAuth Skip Logic Is Dead Code (Issue 1.2 — Security)

**File:** `src/middleware.ts` lines 21–24

**Problem:** The middleware tries to skip CSRF checks for NextAuth routes by looking for `[...nextauth]` in the URL, which never appears in actual request paths. Additionally, operator precedence is wrong (`A && B || C` parses as `(A && B) || C`).

**Fix:**
- Option A (preferred): Remove the NextAuth skip logic entirely, since NextAuth's POST endpoints work correctly with the Origin header check already in place. The skip is unnecessary.
- Option B: Replace with a simple prefix check: `if (request.nextUrl.pathname.startsWith("/api/auth/"))` — but only if there is a demonstrated need to skip the Origin check for these routes.

**Verification:** Manually test sign-in, sign-out, and session refresh flows to confirm they still work after the change.

---

### 3. Significant Dead Code Remains (Issue 2.1 — Architecture)

**File:** `src/lib/profile-utils.ts` lines 48–115, `src/types/enums.ts`, `src/samples/`

**Problem:** Six filter functions (`filterByPublished`, `filterByType`, `filterByEngineCount`, `filterByOwner`, `filterBySearch`, `filterProfiles`) are never imported anywhere. The `PublishedStatus` and `GaugeType` enums are unused. The sample JSON contains a stale `ForkedFrom` field.

**Fix:**
- Delete the six dead filter functions from `src/lib/profile-utils.ts`.
- Delete the `PublishedStatus` enum from `src/types/enums.ts`.
- Delete the `GaugeType` enum from `src/types/enums.ts`.
- Remove the `ForkedFrom` field from `src/samples/2b73437f-aed3-4fa1-b1cc-0e21323775b0.json`.
- Run a project-wide search after each deletion to confirm nothing references the removed code.

**Verification:** Confirm the project still builds cleanly (`npm run build`) after all deletions.

---

### 4. FAQ Content Is Factually Outdated (Issue 4.1 — UI/Usability)

**File:** `src/app/faq/page.tsx`

**Problem:** Multiple FAQ entries still reference Microsoft Account login, which is no longer used. The app now uses local email/password credentials. Specific entries:
- "Do I have to log in?" references Microsoft Account.
- "Why Microsoft Account?" is entirely irrelevant.
- "Does the site store passwords?" falsely says no passwords are stored.

**Fix:**
- Rewrite the "Do I have to log in?" answer to explain local email/password registration.
- Remove or replace the "Why Microsoft Account?" entry entirely.
- Rewrite the "Does the site store passwords?" answer to accurately state that password hashes (Argon2) are stored, and that plaintext passwords are never retained.
- Review all other FAQ entries for consistency with the current authentication system.

**Verification:** Visual inspection of the FAQ page to confirm accuracy.

---

### 5. Privacy Policy Is Outdated (Issue 4.2 — UI/Usability)

**File:** `src/app/privacy/page.tsx`

**Problem:** The privacy policy (last updated March 2022) still references Microsoft Account login and fails to disclose that the app now collects and stores email addresses, display names, and password hashes. This may create legal compliance issues (GDPR, CCPA).

**Fix:**
- Update the privacy policy to list all currently collected data: email address, display name, password hash (Argon2).
- Remove all references to Microsoft Account login.
- Note that IP addresses are used for rate limiting but are not persisted to disk.
- Update the "last updated" date.
- Add a note about data retention and deletion practices if applicable.

**Verification:** Visual inspection of the privacy page to confirm accuracy and completeness.

---

## MEDIUM Severity

### 6. `registerUser` Has a Race Condition (Issue 1.3 — Security)

**File:** `src/lib/user-service.ts` lines 29–41

**Problem:** Two concurrent registration requests for the same email can both pass the `findUserByEmail` check. The second `createUser` call throws a MongoDB duplicate key error (code 11000) which propagates as an unhandled 500 error instead of a 409 Conflict.

**Fix:**
- Replace `createUser` with `createUserIdempotent` in the `registerUser` function (which already handles code 11000), OR
- Wrap the `createUser` call in a `try/catch` that catches `MongoServerError` with code 11000 and rethrows as a `ConflictError`.

**Verification:** Write a test that simulates concurrent registration and confirms a 409 Conflict is returned (not a 500).

---

### 7. Rate Limiter Trusts Spoofable `x-forwarded-for` Header (Issue 1.4 — Security)

**File:** `src/lib/rate-limit.ts` lines 72–80

**Problem:** An attacker can bypass rate limiting by sending a different `x-forwarded-for` header with each request, since the rate limiter uses this header as the client identifier without verification.

**Fix:**
- Add a code comment documenting the deployment requirement: the app MUST be deployed behind a trusted reverse proxy (e.g. Vercel, Cloudflare) that strips or overwrites the `x-forwarded-for` header.
- Consider adding a configuration option to specify trusted proxy depth, or fall back to a combination of IP + other request fingerprint data.

**Verification:** Review the code comment and confirm the documentation is clear.

---

### 8. Account Conversion Flow Lacks Atomicity (Issue 1.6 — Security)

**File:** `src/lib/user-service.ts` lines 107–154

**Problem:** `completeConversion` performs three separate database operations (`createUserIdempotent`, `updateProfileOwner`, `markConversionTokenUsed`) without transactional guarantees. A crash between steps can leave the system in an inconsistent state.

**Fix:**
- Wrap all three operations inside a MongoDB multi-document transaction using `session.withTransaction()`.
- Pass the session to each database operation.
- Handle transaction commit/abort and retry on transient errors.

**Verification:** Review the transaction logic and confirm that all three operations are within the transaction scope.

---

### 9. Field-Mapping Layer Is Fragile (Issue 2.2 — Architecture)

**File:** `src/lib/field-mapping.ts`

**Problem:** The camelCase↔PascalCase mapping uses an explicit map object with no compile-time or runtime check that all `Profile` fields are present. Missing fields cause silent data loss during import (Zod `.strip()` removes unknown keys) and broken exports.

**Fix:**
- Add a compile-time exhaustiveness check using a TypeScript mapped type that requires all keys of `Profile` to be present in the map, OR
- Add a runtime test that compares the keys in the mapping object against the keys of the Profile Zod schema and fails if any are missing.

**Verification:** Add a test that fails if a new field is added to the Profile type but not to the mapping.

---

### 10. No Error Boundary or `error.tsx` (Issue 2.3 — Architecture)

**Problem:** The app has no `error.tsx` files. Unhandled errors during render show a raw white screen or cryptic Next.js error.

**Fix:**
- Create `src/app/error.tsx` as a client component (`"use client"`) with:
  - A user-friendly error message.
  - A "Try again" button that calls the `reset()` function provided by Next.js.
  - Consistent styling with the rest of the app (Bootstrap).

**Verification:** Temporarily throw an error in a server component and confirm the error boundary renders correctly.

---

### 11. No Debounce on Profile List Search (Issue 3.1 — Implementation)

**File:** `src/app/profiles/ProfileListContent.tsx`

**Problem:** The search triggers an API call on every keystroke. Typing "Cessna" sends six queries to MongoDB.

**Fix:**
- Add a debounced version of the search term (e.g. 300ms delay) using `setTimeout`/`clearTimeout` inside a `useEffect`.
- Use the debounced value in the fetch effect instead of the raw `searchTerm`.

**Verification:** Type a multi-character search term and confirm (via browser DevTools network tab) that only one API call is made after the debounce delay.

---

### 12. Keyboard Accessibility Gaps (Issue 4.3 — UI/Usability)

**Files:** `src/components/GaugeDisplay.tsx`, `src/components/ProfileCard.tsx`

**Problem:** Interactive elements (colour indicator buttons, profile cards) use `<div>` elements with `onClick` handlers. They are not focusable via keyboard and have no ARIA roles.

**Fix:**
- Replace `<div onClick={...}>` with `<button>` elements for the colour indicator and colour picker items.
- For `ProfileCard.tsx`, either wrap the card content in an `<a>` tag (since it navigates) or add `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler that triggers on Enter/Space.
- Ensure all interactive elements have accessible names.

**Verification:** Tab through the UI and confirm all interactive elements are reachable and activatable via keyboard.

---

### 13. Mobile Responsiveness Is Poor in the Editor (Issue 4.4 — UI/Usability)

**File:** `src/components/ProfileEditor.tsx`

**Problem:** Fixed Bootstrap column widths (`col-1`, `col-2`, `col-3`) don't stack on small screens. Inputs are unusably narrow on mobile.

**Fix:**
- Replace fixed column classes with responsive variants: e.g. `col-12 col-md-3`, `col-6 col-md-1`.
- Ensure gauge editor inputs stack vertically on small screens.
- Test the layout at 375px width (iPhone SE) to confirm usability.

**Verification:** Resize the browser to mobile width and confirm the editor is usable.

---

## LOW Severity

### 14. No Password Strength Checking Beyond Length (Issue 1.5 — Security)

**Problem:** The only password validation is `password.length < 8`. Common passwords like `password` or `12345678` pass validation.

**Fix:**
- Add a static list of the top 1,000 most common/breached passwords as a JSON or text file.
- Check submitted passwords against this list during registration and password change.
- Return a clear error message if the password is on the list.

**Verification:** Attempt to register with `password` and `12345678` and confirm they are rejected.

---

### 15. `dangerouslySetInnerHTML` in FAQ Page (Issue 1.7 — Security)

**File:** `src/app/faq/page.tsx` line 88

**Problem:** FAQ answers use `dangerouslySetInnerHTML`. While content is currently hardcoded (no XSS risk today), this is a latent vulnerability if FAQ content is ever loaded from a dynamic source.

**Fix:**
- Replace `dangerouslySetInnerHTML` with a simple function that parses the FAQ text and renders `<a>` tags as React `<a>` elements.
- Alternatively, use a lightweight safe markdown renderer.

**Verification:** Confirm the FAQ page renders identically after the change, with all links still working.

---

### 16. MongoDB Development Connection Has No Error Handling (Issue 2.4 — Architecture)

**File:** `src/lib/mongodb.ts` lines 21–25

**Problem:** The development branch of the MongoDB connection setup has no `.catch()` handler, unlike the production branch. Errors are unhandled promise rejections.

**Fix:**
- Add `.catch((err) => { console.error("MongoDB connection error:", err); })` to the development branch, matching the production branch pattern.

**Verification:** Code review to confirm both branches have error handling.

---

### 17. `ensureIndexes` Runs on Every Request (Issue 2.5 — Architecture)

**Files:** `src/lib/user-store.ts`, `src/lib/token-store.ts`

**Problem:** Index-ensuring functions are called before every database operation. While guarded by a module-level boolean, the pattern is scattered and adds minor overhead.

**Fix:**
- Move index creation to a single initialization function that runs once at application startup (e.g. in a server initialization hook or a top-level `init()` function called from the MongoDB connection setup).
- Remove the per-operation `ensureIndexes()` calls.

**Verification:** Confirm the app starts successfully and indexes are created.

---

### 18. Profile Export Doesn't Sanitize Filenames (Issue 2.6 — Architecture)

**File:** `src/lib/export.ts` line 17

**Problem:** The profile name is used directly as the download filename without sanitization. The `sanitize-filename` package is already a project dependency but is not used here.

**Fix:**
- Import `sanitize` from `sanitize-filename`.
- Change line 17 to: `a.download = sanitize(\`${profile.name}.json\`);`

**Verification:** Create a profile with special characters in the name (e.g. `Test/Profile`) and export it to confirm the filename is sanitized.

---

### 19. `Notice.tsx` Duplicates the Search Input (Issue 3.2 — Implementation)

**File:** `src/components/Notice.tsx` lines 38–53

**Problem:** Two separate `<input>` elements are rendered for mobile and desktop, both controlled by the same state. A single responsive input would suffice.

**Fix:**
- Replace the two inputs with a single `<input>` element using responsive CSS classes for width adjustments across breakpoints.

**Verification:** Confirm the search input renders correctly at both mobile and desktop widths.

---

### 20. `beforeunload` Warning Fires Without Actual Changes (Issue 3.3 — Implementation)

**File:** `src/app/profile/[id]/ProfilePageContent.tsx` lines 70–78

**Problem:** The `beforeunload` listener fires whenever `editing === true && profile !== null`, even if no edits have been made.

**Fix:**
- Add a `dirty` state flag, initialized to `false` when entering edit mode.
- Set `dirty = true` on the first `setProfile` call after entering edit mode.
- Only register the `beforeunload` handler when `dirty` is `true`.

**Verification:** Enter edit mode, make no changes, and navigate away — no warning should appear. Make a change, then navigate — warning should appear.

---

### 21. Dropdowns Don't Close on Outside Click (Issue 3.4 — Implementation)

**Files:** `src/components/GaugeDisplay.tsx`, `src/components/Navbar.tsx`

**Problem:** The colour picker and user menu dropdowns only close when a specific option is clicked, not when clicking outside.

**Fix:**
- Add a `useEffect` that registers a `mousedown` event listener on `document`.
- In the handler, check if the click target is outside the dropdown ref. If so, close the dropdown.
- Clean up the listener on unmount.

**Verification:** Open a dropdown, click outside it, and confirm it closes.

---

### 22. Numeric Input Coercion on Empty (Issue 3.5 — Implementation)

**Files:** `src/components/ProfileEditor.tsx` line 33, `src/components/GaugeDisplay.tsx` line 79

**Problem:** Clearing a numeric field immediately coerces the value to `0`, preventing users from typing a new value without a `0` appearing first.

**Fix:**
- Allow empty string (`""`) as a valid intermediate state in the controlled input.
- Coerce to `0` only on blur or on save, not on every change event.

**Verification:** Clear a numeric field and confirm the field shows empty (not `0`) until focus is lost.

---

### 23. Import Error Handling Discards Server Error Messages (Issue 4.5 — UI/Usability)

**File:** `src/app/import/page.tsx` line 54

**Problem:** The catch block discards the actual error. Zod validation errors from the API are hidden behind a generic message.

**Fix:**
- In the catch block, read the response body (if available) and extract the server's error message.
- Display the specific error message to the user instead of the generic fallback.

**Verification:** Import an invalid JSON file and confirm the specific validation error is displayed.

---

### 24. No Loading Indicator During Profile Fetch (Issue 4.6 — UI/Usability)

**File:** `src/app/profile/[id]/ProfilePageContent.tsx`

**Problem:** No spinner or skeleton is shown while fetching a profile by ID. The only indication is the heading fallback text "Loading...".

**Fix:**
- Add a loading state (e.g. `isLoading`) that is `true` while the profile is being fetched.
- Render a spinner or skeleton component while `isLoading` is true.
- Use Bootstrap's spinner component for consistency.

**Verification:** Navigate to a profile page and confirm a spinner is visible during the fetch.
