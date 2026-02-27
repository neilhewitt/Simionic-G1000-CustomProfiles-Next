# Code Review: Simionic G1000 Custom Profiles (Next.js)

**Reviewed:** February 2026  
**Updated:** February 2026 — reflects fixes applied in this revision  
**Stack:** Next.js 16 / React 19 / MongoDB / Auth.js v5 / Argon2 / Nodemailer  
**Scope:** Full codebase — security, architecture, implementation, usability

---

## Executive Summary

The application is a Next.js web app that lets users browse, create, edit, import, and export Garmin G1000 custom aircraft profiles stored in MongoDB. The overall structure is reasonable for a small personal project. Authentication uses JWT sessions via NextAuth v4 with Argon2 password hashing, which are solid choices.

**In this revision**, the most impactful security issues have been addressed: the conversion token is now hashed before storage; unpublished profiles are filtered server-side; a Content-Security-Policy header has been added; the Bootstrap Icons CDN link now carries a Subresource Integrity hash; `NEXTAUTH_SECRET` is validated at startup; and MongoDB connection failures are now logged rather than silently swallowed. Several implementation bugs have also been fixed (malformed JSON returning 500 instead of 400; `cancelEdit` silently failing; the `skipped` counter never being incremented; missing `beforeunload` guard). Dead code has been removed.

What remains open are larger architectural items (pagination, database transactions, a service layer, field naming migration) and lower-priority usability improvements. These are documented below, in order of severity within each category.

---

## 1. Security Issues

### 1.1 ~~Hardcoded Credentials in Version-Controlled Script~~ — ✅ FIXED

**File:** `scripts/seed-user.js` (deleted)

A real email address and plaintext password were hardcoded in `scripts/seed-user.js`. The file has been removed and credentials have been purged from git history.

> **Reference:** OWASP A07:2021 – Identification and Authentication Failures; CWE-798 (Use of Hard-coded Credentials).

---

### 1.2 No Rate Limiting on Authentication Endpoints — **HIGH** — ⚠️ OPEN

**Files:** `src/app/api/auth/register/route.ts`, `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/reset-password/route.ts`

None of the custom auth endpoints implement rate limiting. This creates at least two exploitable attack surfaces:

**a) Reset code brute-force:** The 6-digit numeric code (`randomInt(100000, 999999)`) has only 900,000 possible values. The code expires in 15 minutes. With no rate limiting, an attacker who knows a target's email address can exhaust the entire code space via automated requests in under a minute.

**b) Registration spam:** Without rate limiting, an attacker can bulk-register accounts from a single IP, consuming server resources and polluting the database.

**Fix:** Add rate limiting middleware. For a Next.js deployment, `next-rate-limit` or an edge middleware approach (e.g., Upstash Rate Limit with Redis) is appropriate. For the reset code specifically, consider switching to a longer random token (UUID or 32-byte hex) delivered as a URL link rather than a code users type in.

> **Reference:** OWASP A07:2021; NIST SP 800-63B §5.1.3; OWASP Authentication Cheat Sheet.

---

### 1.3 ~~Conversion Token Stored as Plaintext~~ — ✅ FIXED

**File:** `src/lib/token-store.ts`

The account conversion token UUID is now SHA-256 hashed before storage (matching the reset code approach). The `ConversionToken` record now stores `tokenHash` instead of `token`. The raw token is returned in the email link; `getConversionToken` and `markConversionTokenUsed` hash the submitted token before database lookup.

> **Reference:** OWASP A02:2021 – Cryptographic Failures; CWE-312 (Cleartext Storage of Sensitive Information).

---

### 1.4 ~~Unauthenticated Access to Unpublished Profiles~~ — ✅ FIXED

**File:** `src/lib/data-store.ts`

`getAllProfiles()` now adds `{ IsPublished: true }` to the MongoDB query filter. Draft and unpublished profiles are no longer returned from the public API endpoint. Server-side filtering also prevents the client-side-only workaround from being bypassed by direct API calls.

> **Reference:** OWASP A01:2021 – Broken Access Control; CWE-284.

---

### 1.5 ~~No Content-Security-Policy Header~~ — ✅ FIXED

**File:** `next.config.ts`

A `Content-Security-Policy` header has been added to the security headers array in `next.config.ts`. The policy restricts `script-src` to `'self' 'unsafe-inline'` (required for Next.js hydration scripts), `style-src` to `'self' 'unsafe-inline' https://cdn.jsdelivr.net`, `font-src` and `img-src` to `'self'` plus `data:`, and sets `frame-ancestors 'none'` to complement `X-Frame-Options: DENY`.

Note: `'unsafe-inline'` for scripts is required because Next.js App Router injects inline hydration scripts. A nonce-based CSP (which would allow removal of `'unsafe-inline'`) requires Next.js middleware to generate and inject a per-request nonce, and is left as a future improvement.

> **Reference:** OWASP A05:2021 – Security Misconfiguration; MDN Content Security Policy.

---

### 1.6 ~~External CSS Without Subresource Integrity~~ — ✅ FIXED

**File:** `src/app/layout.tsx`

The Bootstrap Icons CDN `<link>` now includes `integrity="sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb"` and `crossOrigin="anonymous"`. If jsDelivr serves a tampered file, the browser will refuse to load it.

> **Reference:** W3C Subresource Integrity specification; MDN SRI documentation.

---

### 1.7 No CSRF Protection on Custom API Routes — **MEDIUM** — ⚠️ OPEN

**Files:** All routes under `src/app/api/auth/`

The custom API routes have no CSRF protection. The `Content-Type: application/json` requirement provides some protection, but does not fully mitigate CSRF.

**Fix:** Verify the `Origin` header against the expected application domain on all state-mutating custom API routes, or add a CSRF token verification step implemented in Next.js middleware.

> **Reference:** OWASP CSRF Prevention Cheat Sheet; OWASP A01:2021.

---

### 1.8 ~~MongoDB Connection Failure on Module Load~~ — ✅ FIXED

**File:** `src/lib/mongodb.ts`

The production `client.connect()` call now has a `.catch()` handler that logs the error before re-throwing. This ensures connection failures are always logged and prevents silent unhandled promise rejections.

> **Reference:** Node.js documentation on Unhandled Promise Rejections; MongoDB Node.js Driver best practices.

---

### 1.9 ~~`NEXTAUTH_SECRET` Is Not Validated at Startup~~ — ✅ FIXED

**File:** `src/lib/auth.ts`

An explicit check is now present at module load time:

```ts
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET environment variable is not set");
}
```

This causes an immediate, unambiguous startup failure rather than a hard-to-diagnose runtime error.

> **Reference:** Auth.js documentation – Secret; NIST SP 800-63B §4.3.

---

### 1.10 Profile Import Has No Server-Side Schema Validation — **MEDIUM** — ⚠️ OPEN

**File:** `src/app/import/page.tsx`, `src/app/api/profiles/[id]/route.ts`

When a user imports a profile, the client reads a JSON file and POSTs it directly to the API. The API validates only `Name` length and `Notes` length; arbitrary additional fields can be injected into the MongoDB document via the `$set` spread.

**Fix:** Use a schema validation library (Zod, Yup, or manual validation) to whitelist the fields that are acceptable on the incoming profile before persisting it. Strip any unknown fields.

> **Reference:** OWASP A03:2021 – Injection; OWASP Input Validation Cheat Sheet.

---

## 2. Architecture and Design Issues

### 2.1 All Profiles Are Fetched Without Pagination — **HIGH** — ⚠️ OPEN

**Files:** `src/lib/data-store.ts`, `src/app/api/profiles/route.ts`, `src/app/profiles/ProfileListContent.tsx`

`getAllProfiles()` still fetches every published profile in the database with `.find({ IsPublished: true }).toArray()`. All filtering — by type, engine count, owner, and search term — is done in JavaScript in the browser after the entire dataset has been transferred. As the profile count grows, the API response grows proportionally.

**What should be done instead:** Server-side filtering and pagination. The API should accept query parameters (`?type=piston&engines=1&page=2&limit=20`) and execute the filter in MongoDB with `.skip()` and `.limit()`.

> **Reference:** MongoDB documentation on querying and pagination; OWASP A04:2021 – Insecure Design.

---

### 2.2 No Database Transactions on the Account Conversion Flow — **HIGH** — ⚠️ OPEN

**File:** `src/app/api/auth/convert/complete/route.ts`

The conversion flow performs three database operations (`createUser`, `updateProfileOwner`, `markConversionTokenUsed`) without any atomicity guarantee. A server crash between steps can leave a user with a new account but orphaned profiles.

**Fix:** Wrap all three operations in a MongoDB transaction with `session.withTransaction(...)`.

> **Reference:** MongoDB ACID Transactions documentation; OWASP A04:2021 – Insecure Design.

---

### 2.3 No Service Layer — Business Logic Scattered Across API Routes — **MEDIUM** — ⚠️ OPEN

All business logic (ownership checks, validation, owner injection, etc.) lives directly in the API route handlers. This makes it impossible to unit-test business logic without spinning up an HTTP server, and duplicates patterns across routes.

**What should be done instead:** Introduce a service layer (`src/lib/profile-service.ts`, `src/lib/user-service.ts`) that encapsulates business logic independently of HTTP.

> **Reference:** Clean Architecture; SOLID principles.

---

### 2.4 PascalCase Field Names on the Profile Model — **MEDIUM** — ⚠️ OPEN

The `Profile` type and MongoDB documents use PascalCase for field names (inherited from the original C# codebase), while `User` and all JS/TS conventions use camelCase. This creates persistent friction and will confuse future contributors.

**What should be done instead:** Migrate to camelCase internally; handle the casing transformation at the API boundary for import/export compatibility.

> **Reference:** Google JavaScript Style Guide; MDN JavaScript naming conventions.

---

### 2.5 ~~Dead Code: `EditProfileContent.tsx`~~ — ✅ FIXED

**File:** `src/app/edit/[id]/EditProfileContent.tsx` (deleted)

The 232-line `EditProfileContent.tsx` — a full editing UI that was never rendered, having been superseded by `ProfilePageContent.tsx` — has been deleted. The `/edit/[id]` redirect page (`page.tsx`) has been retained as a legacy redirect for any external links or bookmarks.

---

### 2.6 Email Service Uses Local Filesystem in Development — **LOW** — ⚠️ OPEN (informational)

**File:** `src/lib/email/fake-email-service.ts`

The fake email service writes emails to `process.cwd()/email/`. This is fragile in serverless environments and produces files that are never cleaned up. A better approach for development is a proper local SMTP server (e.g., MailHog or Mailpit).

---

### 2.7 ~~`next-auth` v4 with Next.js 15+~~ — ✅ FIXED

**File:** `package.json`, `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/profiles/[id]/route.ts`

The project has been migrated from NextAuth v4 to Auth.js v5 (`next-auth@5.0.0-beta.30`). The `NextAuthOptions` export has been replaced with the `NextAuth()` function API that returns `{ handlers, auth, signIn, signOut }`. Server-side session retrieval now uses the exported `auth()` function instead of `getServerSession(authOptions)`. The route handler uses the `handlers` export. Client-side hooks (`useSession`, `signIn`, `signOut`, `SessionProvider`) remain compatible.

> **Reference:** Auth.js v5 migration guide.

---

## 3. Implementation Issues

### 3.1 6-Digit Reset Code Is Brute-Forceable — **HIGH** — ⚠️ OPEN

(See also §1.2.) The 6-digit numeric code has only 900,000 possible values and is structurally weak. A UUID or 32-byte random hex token delivered as a URL link (rather than a user-typed code) is both more secure and a better user experience.

---

### 3.2 `Number(e.target.value) || 0` Mishandles Input State — **MEDIUM** — ⚠️ OPEN

**Files:** `src/components/ProfileEditor.tsx`, `src/components/GaugeDisplay.tsx`

When a user clears a numeric input field, `Number("") === 0` causes the stored value to silently become `0`. Use `input type="number"` for numeric fields to improve both validation feedback and mobile keyboard experience.

---

### 3.3 ~~Unpublished Profiles Visible Without Auth~~ — ✅ FIXED

(See §1.4.) `getAllProfiles()` now filters by `{ IsPublished: true }` in the MongoDB query; client-side filtering is no longer the only guard.

---

### 3.4 ~~`cancelEdit` Has No Error Handling~~ — ✅ FIXED

**File:** `src/app/profile/[id]/ProfilePageContent.tsx`

`cancelEdit` now includes a `.catch()` handler that calls `setError(err.message)` on network or HTTP errors. The error message includes the HTTP status code and status text for easier debugging. Previously, a failed fetch left the profile in an indeterminate state with no user feedback.

---

### 3.5 Array Index Used as React Key — **MEDIUM** — ⚠️ OPEN (low risk)

**Files:** `src/components/GaugeDisplay.tsx`, `src/components/ProfileEditor.tsx`

Array indices are used as React `key` props for gauge range items. The gauge ranges are always 4 elements and the list never reorders, so this does not cause bugs today. It remains a bad habit that will cause issues if the array length or order ever changes. The `GaugeRange` type does not include a stable identifier field; introducing one would be the correct fix.

> **Reference:** React documentation – Keys.

---

### 3.6 ~~`migrate-to-mongo.ts` Never Increments the `skipped` Counter~~ — ✅ FIXED

**File:** `scripts/migrate-to-mongo.ts`

The `skipped` variable was declared with `let` but never incremented. The script uses `upsert: true` (which overwrites existing documents rather than skipping them), so the counter was always misleadingly zero. `skipped` is now declared as `const`, which correctly reflects that no skipping logic exists.

---

### 3.7 ~~`request.json()` Failures Return 500 Instead of 400~~ — ✅ FIXED

**Files:** All API route handlers

All API route handlers now wrap `request.json()` in an inner `try/catch`. A `SyntaxError` from a malformed JSON body now returns HTTP 400 (`"Invalid JSON body."`) rather than propagating to the generic 500 error handler. Zero-disclosure endpoints (`forgot-password`, `convert/request`) silently return their standard 200 response for malformed requests.

---

### 3.8 `Profile.id` Is `string | null` Throughout — **LOW** — ⚠️ OPEN

The `Profile` type declares `id: string | null` to represent unsaved profiles. This propagates null-checks throughout the save flow. A discriminated union (`NewProfile | SavedProfile`) would make the type system enforce this distinction rather than relying on scattered null checks.

---

## 4. Usability Issues

### 4.1 No Delete Functionality — **HIGH** — ⚠️ OPEN

There is no `DELETE /api/profiles/[id]` endpoint and no delete button in the UI. The database will accumulate draft and test profiles indefinitely.

---

### 4.2 ~~No Warning on Navigating Away With Unsaved Changes~~ — ✅ FIXED

**File:** `src/app/profile/[id]/ProfilePageContent.tsx`

A `beforeunload` event listener is now attached via `useEffect` when `editing === true && profile !== null`. The handler calls both `e.preventDefault()` and sets `e.returnValue = ''` for broad browser compatibility. The listener is removed when the component unmounts or editing ends.

---

### 4.3 Profile Name Field Is at the Bottom of the Edit Form — **MEDIUM** — ⚠️ OPEN

The profile name field appears at the very bottom of the page, below all gauge configuration. It should be at the top, near the profile's title heading.

---

### 4.4 Numeric Fields Use `type="text"` — **MEDIUM** — ⚠️ OPEN

(See §3.2.) All numeric inputs in `ProfileEditor` and `GaugeDisplay` use `type="text"`. Switching to `type="number"` would improve mobile UX (numeric keypad) and provide browser-native validation.

---

### 4.5 `ForkedFrom` Field Exists in the Data Model But Has No UI — **LOW** — ⚠️ OPEN

`Profile.ForkedFrom: string | null` is defined and populated as `null` in `createDefaultProfile()` but is never displayed or set by any UI code. Either implement the "Fork this profile" feature or remove the field until it is needed.

---

### 4.6 No Loading Skeleton or Spinner for Profile List — **LOW** — ⚠️ OPEN

The profile list shows only `<h5>Loading...</h5>` while data is fetched. A skeleton loader would significantly improve perceived performance.

> **Reference:** Google Web.dev – Skeleton screens.

---

### 4.7 V-Speed Labels Have No Tooltips or Explanations — **LOW** — ⚠️ OPEN

The V-speed labels (`Vs0`, `Vs1`, `Vfe`, `Vno`, `Vne`, `Vglide`, `Vr`, `Vx`, `Vy`) will be unfamiliar to non-pilots. Simple `title` attributes or `<abbr>` elements with explanatory text would help.

---

### 4.8 Error Messages Are Generic — **LOW** — ⚠️ OPEN

`err.message` from network fetches is shown directly to the user in several places. Error messages shown to users should be user-friendly and not expose internals.

---

## 5. Summary

| # | Area | Status | Severity |
|---|---|---|---|
| 1.1 | Hardcoded credentials | ✅ FIXED (prior revision) | CRITICAL |
| 1.2 | No rate limiting on auth endpoints | ⚠️ OPEN | HIGH |
| 1.3 | Conversion token stored as plaintext | ✅ FIXED | HIGH |
| 1.4 | Unpublished profiles accessible without auth | ✅ FIXED | HIGH |
| 1.5 | No Content-Security-Policy header | ✅ FIXED | HIGH |
| 1.6 | External CSS without Subresource Integrity | ✅ FIXED | MEDIUM |
| 1.7 | No CSRF protection on custom API routes | ⚠️ OPEN | MEDIUM |
| 1.8 | MongoDB connection failure not handled | ✅ FIXED | MEDIUM |
| 1.9 | `NEXTAUTH_SECRET` not validated at startup | ✅ FIXED | MEDIUM |
| 1.10 | No server-side schema validation on import | ⚠️ OPEN | MEDIUM |
| 2.1 | All profiles fetched without pagination | ⚠️ OPEN | HIGH |
| 2.2 | No database transactions on conversion flow | ⚠️ OPEN | HIGH |
| 2.3 | No service layer | ⚠️ OPEN | MEDIUM |
| 2.4 | PascalCase field names | ⚠️ OPEN | MEDIUM |
| 2.5 | Dead code: `EditProfileContent.tsx` | ✅ FIXED | LOW |
| 2.6 | Fake email writes to local filesystem | ⚠️ OPEN | LOW |
| 2.7 | NextAuth v4 with Next.js 15+ | ✅ FIXED | LOW |
| 3.1 | 6-digit reset code brute-forceable | ⚠️ OPEN | HIGH |
| 3.2 | `Number(e.target.value) \|\| 0` mishandles empty input | ⚠️ OPEN | MEDIUM |
| 3.3 | Unpublished profiles visible without auth | ✅ FIXED (= 1.4) | HIGH |
| 3.4 | `cancelEdit` has no error handling | ✅ FIXED | MEDIUM |
| 3.5 | Array index as React key | ⚠️ OPEN (low risk) | MEDIUM |
| 3.6 | `skipped` counter never incremented | ✅ FIXED | LOW |
| 3.7 | Malformed JSON returns 500 not 400 | ✅ FIXED | LOW |
| 3.8 | `Profile.id` is `string \| null` | ⚠️ OPEN | LOW |
| 4.1 | No delete functionality | ⚠️ OPEN | HIGH |
| 4.2 | No warning on navigating away with unsaved changes | ✅ FIXED | HIGH |
| 4.3 | Profile name field at bottom of edit form | ⚠️ OPEN | MEDIUM |
| 4.4 | Numeric fields use `type="text"` | ⚠️ OPEN | MEDIUM |
| 4.5 | `ForkedFrom` field has no UI | ⚠️ OPEN | LOW |
| 4.6 | No loading skeleton for profile list | ⚠️ OPEN | LOW |
| 4.7 | V-speed labels have no tooltips | ⚠️ OPEN | LOW |
| 4.8 | Error messages are generic | ⚠️ OPEN | LOW |

---

## Sources

- OWASP Top 10 (2021): https://owasp.org/www-project-top-ten/
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Input Validation Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- NIST SP 800-63B (Digital Identity Guidelines): https://pages.nist.gov/800-63-3/sp800-63b.html
- W3C Subresource Integrity: https://www.w3.org/TR/SRI/
- MDN Content Security Policy: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- MDN Subresource Integrity: https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity
- CWE-798 Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
- CWE-312 Cleartext Storage of Sensitive Information: https://cwe.mitre.org/data/definitions/312.html
- MongoDB Transactions: https://www.mongodb.com/docs/manual/core/transactions/
- Node.js – Unhandled Promise Rejections: https://nodejs.org/api/process.html#event-unhandledrejection
- React – Keys: https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key
- Auth.js v5 (NextAuth v5): https://authjs.dev
- Google Web.dev – Skeleton screens: https://web.dev/articles/ux-improvements-for-pwa#skeleton-screens

