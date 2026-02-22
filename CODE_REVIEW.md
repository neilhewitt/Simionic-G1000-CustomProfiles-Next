# Code Review: Simionic G1000 Custom Profiles (Next.js)

**Reviewed:** February 2026  
**Stack:** Next.js 16 / React 19 / MongoDB / NextAuth v4 / Argon2 / Nodemailer  
**Scope:** Full codebase — security, architecture, implementation, usability

---

## Executive Summary

The application is a Next.js web app that lets users browse, create, edit, import, and export Garmin G1000 custom aircraft profiles stored in MongoDB. The overall structure is reasonable for a small personal project. Authentication uses JWT sessions via NextAuth v4 with Argon2 password hashing, which are solid choices. However, there are several **serious security vulnerabilities**, a number of architectural weaknesses that will cause real pain as the app grows, and implementation bugs that affect correctness today. These are documented below, in order of severity within each category.

---

## 1. Security Issues

### 1.1 Hardcoded Credentials in Version-Controlled Script — **CRITICAL**

**File:** `scripts/seed-user.js`

```js
const hash = await argon2.hash("P0temkin", { type: argon2.argon2id });
// ...
{ email: "neil.hewitt@gmail.com", name: "Neil Hewitt", ... }
```

A real email address and a hardcoded plaintext password are committed to the repository. Even if this is only intended for local development, committing credentials to source control is a well-documented, high-severity practice that violates basic secrets hygiene. If the repository is or ever becomes public, or if any historical version leaks, the credentials are permanently exposed.

**Fix:** Remove the hardcoded values. Use environment variables or a CLI prompt (`readline`). Any secrets that have already been committed to git history should be treated as compromised and rotated.

> **Reference:** OWASP A07:2021 – Identification and Authentication Failures; CWE-798 (Use of Hard-coded Credentials); GitHub's own guidance on secret scanning.

---

### 1.2 No Rate Limiting on Authentication Endpoints — **HIGH**

**Files:** `src/app/api/auth/register/route.ts`, `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/reset-password/route.ts`

None of the custom auth endpoints implement rate limiting. This creates at least two exploitable attack surfaces:

**a) Reset code brute-force:** The 6-digit numeric code (`randomInt(100000, 999999)`) has only 900,000 possible values. The code expires in 15 minutes. With no rate limiting, an attacker who knows a target's email address can exhaust the entire code space via automated requests in under a minute — the SHA-256 hashing of the stored code is irrelevant here because the comparison happens on the server after the attacker submits guesses. This is a complete bypass of the password reset mechanism.

**b) Registration spam:** Without rate limiting, an attacker can bulk-register accounts from a single IP, consuming server resources and polluting the database.

**Fix:** Add rate limiting middleware. For a Next.js deployment, `next-rate-limit` or an edge middleware approach (e.g., Upstash Rate Limit with Redis) is appropriate. For the reset code specifically, consider: (1) switching to a longer random token (UUID or 32-byte hex) delivered as a URL link rather than a code users type in, or (2) adding a maximum of 5 verification attempts per code, after which the code is invalidated.

> **Reference:** OWASP A07:2021; NIST SP 800-63B §5.1.3 (OTP rate limiting — look-up secrets "shall not be used more than once" and verifiers "shall implement a throttling mechanism"); OWASP Authentication Cheat Sheet.

---

### 1.3 Conversion Token Stored as Plaintext — **HIGH**

**File:** `src/lib/token-store.ts`

The password reset code is SHA-256 hashed before storage (good). The account conversion token — a UUID — is stored as plaintext:

```ts
const record: ConversionToken = {
  email: email.toLowerCase().trim(),
  token,          // raw UUID, not hashed
  expiresAt: ...,
  used: false,
};
```

If the database is compromised, an attacker can immediately use any valid, unexpired conversion token to create a local account (which then owns any profiles linked to the legacy Microsoft account owner ID). This is an inconsistent security posture with the reset code handling.

**Fix:** Hash the conversion token before storage using SHA-256 (matching the reset code approach). Store only the hash; return the raw token in the email link; verify by hashing the submitted token and comparing.

> **Reference:** OWASP A02:2021 – Cryptographic Failures; CWE-312 (Cleartext Storage of Sensitive Information).

---

### 1.4 Unauthenticated Access to Unpublished Profiles — **HIGH**

**File:** `src/app/api/profiles/route.ts`, `src/lib/data-store.ts`

The `GET /api/profiles` endpoint returns **all** profiles from MongoDB with no server-side filtering by `IsPublished`. Draft/unpublished profiles are mixed in with published ones:

```ts
export async function getAllProfiles(): Promise<ProfileSummary[]> {
  const db = await getDb();
  const docs = await db.collection(COLLECTION).find({}, { projection: {...} }).toArray();
  return docs as unknown as ProfileSummary[];
}
```

The filtering happens entirely in the client browser (`filterProfiles` in `profile-utils.ts`). Any unauthenticated user who calls `GET /api/profiles` directly (e.g., with `curl`) receives every unpublished/draft profile in the database, including the profile name, owner name, owner ID, and notes. This is an access control failure.

**Fix:** Filter by `IsPublished: true` in `getAllProfiles()` for the public endpoint. For authenticated users who want to see their own drafts, add a separate endpoint or query parameter that is gated by session.

> **Reference:** OWASP A01:2021 – Broken Access Control; CWE-284.

---

### 1.5 No Content-Security-Policy Header — **HIGH**

**File:** `next.config.ts`

The security headers set in `next.config.ts` include `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`, but **Content-Security-Policy (CSP) is absent**. The layout loads resources from an external CDN:

```tsx
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.5.0/font/bootstrap-icons.css" rel="stylesheet" />
```

Without a CSP, any XSS vulnerability (even in a dependency) can execute arbitrary scripts. Without a CSP, the browser provides no defence against inline script injection.

**Fix:** Add a `Content-Security-Policy` header to `next.config.ts`. For a Next.js app, a reasonable starting policy would restrict `script-src` to `'self'` and trusted CDNs, `style-src` to `'self'` and the specific CDN origins, and block everything else by default.

> **Reference:** OWASP A05:2021 – Security Misconfiguration; MDN Content Security Policy; Google web.dev CSP guide.

---

### 1.6 External CSS Without Subresource Integrity — **MEDIUM**

**File:** `src/app/layout.tsx`

```tsx
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.5.0/font/bootstrap-icons.css" rel="stylesheet" />
```

This CDN resource is loaded without a Subresource Integrity (SRI) hash. If jsDelivr is ever compromised or serves a tampered file, the browser will load it without question. CSS can be used to exfiltrate data (e.g., CSS-based keyloggers targeting input fields) and can load arbitrary external resources via `url()`.

**Fix:** Add an `integrity` attribute with the SHA-384 (or SHA-256/SHA-512) hash of the file, and `crossorigin="anonymous"`. The hash can be generated at https://www.srihash.org or via `openssl dgst`.

> **Reference:** W3C Subresource Integrity specification; MDN SRI documentation.

---

### 1.7 No CSRF Protection on Custom API Routes — **MEDIUM**

**Files:** All routes under `src/app/api/auth/`

NextAuth v4 protects its own endpoints with CSRF tokens. The custom API routes — `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`, and the three `/api/auth/convert/*` routes — have no CSRF protection. While the `Content-Type: application/json` requirement provides some protection in simple cases (a cross-origin form cannot set this header), it does not fully mitigate CSRF because some browsers or configurations may allow it.

**Fix:** Verify the `Origin` header against the expected application domain on all state-mutating custom API routes, or add a CSRF token verification step. Next.js middleware is a clean place to enforce this.

> **Reference:** OWASP CSRF Prevention Cheat Sheet; OWASP A01:2021.

---

### 1.8 MongoDB Connection Failure on Module Load — **MEDIUM**

**File:** `src/lib/mongodb.ts`

In the production branch, `client.connect()` is called synchronously at module evaluation time:

```ts
} else {
  client = new MongoClient(MONGODB_URI);
  clientPromise = client.connect();   // unhandled rejection if this fails
}
```

The returned promise is stored but if `connect()` rejects before any handler is attached, it produces an unhandled promise rejection, which in Node.js 15+ crashes the process. This makes connection failures during startup difficult to diagnose.

**Fix:** Defer connection until the first `getDb()` call, or add proper error handling around the connection promise. The official Next.js + MongoDB example initialises the connection lazily inside `getDb()`.

> **Reference:** Node.js documentation on Unhandled Promise Rejections; MongoDB Node.js Driver best practices.

---

### 1.9 `NEXTAUTH_SECRET` Is Not Validated at Startup — **MEDIUM**

**File:** `src/lib/auth.ts`

NextAuth v4 requires `NEXTAUTH_SECRET` to be set when using JWT sessions in production. The code does not check for its presence. If it is missing, NextAuth falls back to auto-generating a secret (which changes on every restart, invalidating all sessions) or simply errors at runtime in ways that are not immediately obvious.

**Fix:** Add an explicit check at startup (e.g., in `src/lib/auth.ts` or a shared config module):

```ts
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET environment variable is not set");
}
```

> **Reference:** NextAuth v4 documentation – Secret; NIST SP 800-63B §4.3 (session management requirements).

---

### 1.10 Profile Import Has No Server-Side Schema Validation — **MEDIUM**

**File:** `src/app/import/page.tsx`, `src/app/api/profiles/[id]/route.ts`

When a user imports a profile, the client reads a JSON file and POSTs it directly to the API. The API validates only `Name` length and `Notes` length. There is no validation that the submitted JSON actually contains a valid `Profile` structure. An attacker (or a corrupt file) could submit a profile with unexpected additional fields, which would be spread into MongoDB via `$set`:

```ts
await db.collection(COLLECTION).updateOne(
  { id },
  { $set: profile },   // profile is the raw deserialized client JSON
  { upsert: true }
);
```

While MongoDB's `$set` does not allow operator injection (the field names would have to start with `$` to do that, and the Node.js driver would reject them), it does allow injection of arbitrary field names into the document. A carefully crafted request could, for example, overwrite `Owner.Id` with someone else's ID (the server re-injects the owner from the session *after* the validation but *the spread is from the raw body*).

Wait — looking more carefully, the POST handler does `profile.Owner = { Id: session.ownerId, ... }` before calling `upsertProfile`, so the owner cannot be spoofed. But other arbitrary fields can still be injected into the MongoDB document.

**Fix:** Use a schema validation library (Zod, Yup, or manual validation) to whitelist the fields that are acceptable on the incoming profile before persisting it. Strip any unknown fields.

> **Reference:** OWASP A03:2021 – Injection; OWASP Input Validation Cheat Sheet.

---

## 2. Architecture and Design Issues

### 2.1 All Profiles Are Fetched Without Pagination — **HIGH**

**Files:** `src/lib/data-store.ts`, `src/app/api/profiles/route.ts`, `src/app/profiles/ProfileListContent.tsx`

`getAllProfiles()` fetches every profile in the database with `.find({}).toArray()`. All filtering — by type, engine count, owner, published status, and search term — is done in JavaScript in the browser after the entire dataset has been transferred. This is a fundamental design error:

- **Performance:** As the profile count grows, the API response grows proportionally. Fetching 10,000 profiles over the network on every page visit is unacceptable.
- **Security:** As noted in §1.4, unpublished drafts are included in the response, exposing them to anyone.
- **Memory:** The browser must hold the entire dataset in memory.

**What should be done instead:** Server-side filtering and pagination. The API should accept query parameters (`?type=piston&engines=1&published=true&page=2&limit=20`) and execute the filter in MongoDB using `.find({ IsPublished: true, AircraftType: 0, Engines: 1 })` with `.skip()` and `.limit()`. The profile list UI should show paginated results or use cursor-based infinite scroll.

> **Reference:** MongoDB documentation on querying and pagination; OWASP A04:2021 – Insecure Design (processing unbounded data server-side is a design failure).

---

### 2.2 No Database Transactions on the Account Conversion Flow — **HIGH**

**File:** `src/app/api/auth/convert/complete/route.ts`

The conversion flow performs three database operations without any atomicity guarantee:

1. `createUser(email, name, passwordHash)` — creates the new local account
2. `updateProfileOwner(oldOwnerId, user.ownerId, user.name)` — migrates profiles
3. `markConversionTokenUsed(token)` — marks the token as used

If the server crashes or an error occurs between steps 1 and 2, a user ends up with a new account but their profiles are still associated with their old legacy owner ID. The user cannot sign in with Microsoft anymore (the conversion email was issued), and their profiles are orphaned. There is no recovery path.

**Fix:** Wrap all three operations in a MongoDB transaction:

```ts
const session = client.startSession();
try {
  await session.withTransaction(async () => {
    await createUser(..., { session });
    await updateProfileOwner(..., { session });
    await markConversionTokenUsed(..., { session });
  });
} finally {
  session.endSession();
}
```

This requires passing the session to each data-access function, which means refactoring the store functions to accept an optional `ClientSession`. This is non-trivial but necessary for correctness.

> **Reference:** MongoDB ACID Transactions documentation; OWASP A04:2021 – Insecure Design.

---

### 2.3 No Service Layer — Business Logic Scattered Across API Routes — **MEDIUM**

The codebase has a flat structure: `lib/data-store.ts` is a thin MongoDB wrapper, and all business logic (ownership checks, validation, owner injection, etc.) lives directly in the API route handlers. This means:

- Business logic cannot be unit-tested without spinning up an HTTP server.
- The same pattern (validate → check ownership → inject owner from session → persist) is repeated in multiple routes without abstraction.
- Adding a second API entry point (e.g., a future REST API) would require duplicating the logic again.

**What should be done instead:** Introduce a service layer (`src/lib/profile-service.ts`, `src/lib/user-service.ts`) that encapsulates business logic independently of HTTP. The API routes become thin: they parse the request, call the service, and format the response. The services can be tested in isolation.

> **Reference:** Clean Architecture (Robert C. Martin); Domain-Driven Design; SOLID principles.

---

### 2.4 PascalCase Field Names on the Profile Model — **MEDIUM**

The `Profile` type (and the MongoDB documents) uses PascalCase for field names (`Name`, `Owner`, `AircraftType`, `IsPublished`, etc.), while the `User` type and all JavaScript/TypeScript conventions use camelCase. This is clearly inherited from the original C# codebase.

This creates persistent friction: every database query, every property access, and every type annotation is fighting JavaScript conventions. Code reviewers and future contributors will find the inconsistency confusing. Tools like MongoDB Compass display fields in the order they're stored, and the mixed casing makes manual inspection harder.

**What should be done instead:** Migrate to camelCase internally. If backward compatibility with existing JSON exports from the iPad app is a concern (it appears to be, given the import/export feature), handle the casing transformation at the API boundary — accept PascalCase on import and emit PascalCase on export, but store and process camelCase internally.

> **Reference:** Google JavaScript Style Guide; MDN JavaScript naming conventions; TypeScript conventions.

---

### 2.5 Dead Code: `EditProfileContent.tsx` and the `/edit/[id]` Route — **LOW**

**Files:** `src/app/edit/[id]/EditProfileContent.tsx`, `src/app/edit/[id]/page.tsx`

The page at `/edit/[id]` immediately redirects to `/profile/[id]?edit=true`. `EditProfileContent.tsx` implements a full editing UI that is never rendered — it has been superseded by `ProfilePageContent.tsx`. This is 232 lines of dead code that will confuse anyone reading the codebase.

**Fix:** Delete `EditProfileContent.tsx`. The redirect in `page.tsx` can stay if there are any external links or bookmarks pointing to the old `/edit/[id]` path, but should be documented as a legacy redirect.

---

### 2.6 Email Service Uses Local Filesystem in Development — **LOW**

**File:** `src/lib/email/fake-email-service.ts`

The fake email service writes emails to `process.cwd()/email/`. This is fragile — it fails silently in serverless environments (which have read-only filesystems), produces files that are never cleaned up, and is not caught by the existing `.gitignore` pattern (`/email`) unless the files are in the project root. A better approach is a proper development SMTP server (e.g., [MailHog](https://github.com/mailhog/MailHog), [Mailpit](https://github.com/axllent/mailpit), or [Mailtrap](https://mailtrap.io)).

---

### 2.7 `next-auth` v4 with Next.js 15+ — **LOW (Informational)**

The project uses NextAuth v4 (`next-auth: ^4.24.13`) with Next.js 16. Auth.js v5 is the current version and is designed specifically for the Next.js App Router. NextAuth v4 works but requires workarounds for the App Router (e.g., the use of `getServerSession` rather than the v5 `auth()` function). This is technical debt that should be migrated when the team has bandwidth.

> **Reference:** Auth.js v5 migration guide.

---

## 3. Implementation Issues

### 3.1 6-Digit Reset Code Is Brute-Forceable (Implementation Detail) — **HIGH**

(See also §1.2.) Even aside from the rate limiting issue, the choice of a 6-digit numeric code as a reset credential is structurally weak. A UUID or 32-byte random hex string delivered as a URL link (rather than a code the user types) is both more secure and a better user experience — the user clicks a link in their email rather than copying a code.

The current approach combines low entropy (900,000 possibilities) with a user-facing input, which creates pressure to keep the code short and memorable. Switching to a token-in-URL approach removes this tradeoff entirely.

---

### 3.2 `Number(e.target.value) || 0` Mishandles Input State — **MEDIUM**

**Files:** `src/components/ProfileEditor.tsx`, `src/components/GaugeDisplay.tsx`

This pattern appears throughout the numeric input handlers:

```tsx
onChange={(e) => updateGauge({ Max: Number(e.target.value) || 0 })}
```

The problem: `Number("") === 0`, so when a user clears an input field, the value silently becomes `0` rather than reflecting the empty state. The user types nothing but sees nothing wrong until they save. For gauge values where 0 may be a valid and distinct value (e.g., a gauge range starting at 0), this collapses "intentionally zero" and "user cleared the field" into the same state.

Additionally, `Number("abc") || 0` silently drops non-numeric input as `0` with no user feedback. Use `input type="number"` where possible, and validate/report parse errors rather than silently coercing.

---

### 3.3 Unpublished Profiles Visible in Search Without Auth — **HIGH**

(See §1.4 — this is the implementation root cause.) The `GET /api/profiles` route:

```ts
export async function GET() {
  const profiles = await getAllProfiles();    // returns everything
  return NextResponse.json(profiles);
}
```

The published-status filtering is entirely client-side. Fix: apply the `IsPublished: true` filter in the MongoDB query for the public API.

---

### 3.4 `cancelEdit` Has No Error Handling — **MEDIUM**

**File:** `src/app/profile/[id]/ProfilePageContent.tsx`

```ts
function cancelEdit() {
  if (isNew) { router.push("/profiles"); return; }
  fetch(`/api/profiles/${id}`)
    .then((res) => res.json())
    .then((data) => { setProfile(data); setEditing(false); });
    // No .catch() — silent failure
}
```

If the fetch fails (network error, 404, 500), the profile state is left undefined, `editing` remains `true`, and the user sees no error message. The function should handle errors gracefully and display a message.

---

### 3.5 Array Index Used as React Key — **MEDIUM**

**Files:** `src/components/GaugeDisplay.tsx`, `src/components/ProfileEditor.tsx`

```tsx
{gauge.Ranges.map((range, i) => (
  <ColourIndicator key={i} .../>
))}
```

Using the array index as a key is explicitly documented by React as problematic when items can be reordered, added, or removed, because React cannot correctly distinguish one item from another. The gauge ranges are fixed in length (always 4) so this won't cause bugs with reordering, but it's still a bad habit and will cause issues if the array length ever changes.

> **Reference:** React documentation – Keys; Kent C. Dodds "Why you shouldn't use index as a key in React lists."

---

### 3.6 `migrate-to-mongo.ts` Never Increments the `skipped` Counter — **LOW**

**File:** `scripts/migrate-to-mongo.ts`

```ts
let skipped = 0;
// ... skipped is never incremented
console.log(`Done! Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
```

The `skipped` counter is declared but never incremented. The script uses `upsert: true` which overwrites existing documents. If this was meant to skip existing profiles, the logic is absent. The output is misleading.

---

### 3.7 `request.json()` Failures Return 500 Instead of 400 — **LOW**

**Files:** All API route handlers

If a client sends a request with a malformed JSON body (e.g., `body: "not json"`), `await request.json()` throws a `SyntaxError`. All route handlers catch this in a generic `catch` block that returns HTTP 500 ("An unexpected error occurred"). Malformed requests should return 400.

**Fix:** Add explicit handling for `SyntaxError` (or parse JSON defensively) before the main business logic:

```ts
let body: unknown;
try {
  body = await request.json();
} catch {
  return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
}
```

---

### 3.8 `Profile.id` Is `string | null` Throughout — **LOW**

The `Profile` type declares `id: string | null`. New, unsaved profiles have `id: null`, which propagates null-checks through the entire save flow, the save confirmation modal, the status toggle, and button text logic. This is valid TypeScript but is indicative of a design smell — the "null ID" pattern is used to mean "this is a new, unsaved profile," which could be better modelled with a discriminated union:

```ts
type NewProfile = Omit<Profile, 'id'> & { id: null };
type SavedProfile = Omit<Profile, 'id'> & { id: string };
type AnyProfile = NewProfile | SavedProfile;
```

This makes the type system enforce the distinction rather than relying on null checks scattered through the UI code.

---

## 4. Usability Issues

### 4.1 No Delete Functionality — **HIGH**

Users can create, import, edit, and export profiles, but there is no way to delete one. The database will accumulate draft/test profiles with no mechanism for cleanup. There is no `DELETE /api/profiles/[id]` endpoint and no delete button in the UI.

---

### 4.2 No Warning on Navigating Away With Unsaved Changes — **HIGH**

Neither `ProfilePageContent.tsx` nor `EditProfileContent.tsx` attaches a `beforeunload` event handler. If a user spends 20 minutes filling in a complex profile and then accidentally clicks "Back" or closes the tab, all changes are silently lost.

**Fix:** Add a `beforeunload` listener when `editing === true && profile !== null`. In React, this should be implemented in a `useEffect` hook that adds and removes the listener based on the editing state.

---

### 4.3 Profile Name Field Is at the Bottom of the Edit Form — **MEDIUM**

When editing a profile, the name field appears at the very bottom of the page, below all gauge configuration. The profile name is conceptually the most important piece of metadata; it should be at the top of the form, near the profile's title heading, not buried after 20+ input rows.

---

### 4.4 Numeric Fields Use `type="text"` — **MEDIUM**

Throughout the ProfileEditor and GaugeDisplay, numeric inputs use `type="text"`:

```tsx
<input type="text" className="input-text ml-2 custom-profile-textbox"
  value={profile.VacuumPSIRange.Min} ... />
```

On mobile devices, `type="text"` shows the default QWERTY keyboard rather than the numeric keypad. `type="number"` (or `type="tel"` for simpler integer inputs) provides a better mobile experience. If decimal support is needed, `type="number" step="any"` handles it correctly.

---

### 4.5 `ForkedFrom` Field Exists in the Data Model But Has No UI — **LOW**

`Profile.ForkedFrom: string | null` is defined in the type and populated in `createDefaultProfile()` (as `null`). There is no UI to fork/clone a profile, and the field is never displayed or set by any UI code. Either implement the feature (a "Fork this profile" button on the profile view that creates a copy owned by the current user) or remove the field until it is needed.

---

### 4.6 No Loading Skeleton or Spinner for Profile List — **LOW**

The profile list page shows only:

```tsx
<h5>Loading...</h5>
```

while data is fetched. A skeleton loader (placeholder cards matching the layout of real cards) significantly improves perceived performance and is standard practice in modern web apps.

> **Reference:** Google Web.dev – Skeleton screens; Nielsen Norman Group loading indicators research.

---

### 4.7 V-Speed Labels Have No Tooltips or Explanations — **LOW**

The V-speeds displayed in the editor (`Vs0`, `Vs1`, `Vfe`, `Vno`, `Vne`, `Vglide`, `Vr`, `Vx`, `Vy`) will be unfamiliar to non-pilots or student pilots using the app. Simple HTML `title` attributes or `<abbr>` elements with explanatory text (e.g., "Vs0 — Stall speed in landing configuration") would help.

---

### 4.8 Error Messages Are Generic — **LOW**

Several pages use the pattern:

```tsx
<p className="text-center text-danger">{error}</p>
<p className="text-center">
  Please try again later, or if this persists, contact{" "}
  <Link href="/contact">the site admin</Link>.
</p>
```

The error message from the network fetch (`err.message`) is shown directly to the user. This can leak internal implementation details (stack traces, network error codes) in some failure scenarios. Error messages shown to users should be user-friendly and not expose internals.

---

## 5. Summary: What Should Be Done Differently

| Area | Current Approach | Recommended Approach |
|---|---|---|
| Profile list API | Fetch all; filter client-side | Server-side filtering and pagination |
| Password reset | 6-digit numeric code, no rate limiting | Token-in-URL link, rate limiting |
| Conversion token | Stored as plaintext UUID | Stored as SHA-256 hash |
| Auth endpoints | No CSRF protection | Verify `Origin` header or CSRF token |
| Security headers | Missing CSP | Add strict CSP; add SRI to CDN resources |
| Database operations | Separate operations, no transactions | MongoDB transactions for multi-step flows |
| Architecture | Logic in API routes | Service layer between routes and data access |
| Seed script | Hardcoded credentials | Environment variables or prompts |
| Numeric inputs | `type="text"` | `type="number"` for numeric fields |
| Field naming | PascalCase (legacy C#) | camelCase (JavaScript convention) |
| Delete functionality | Not implemented | Add DELETE endpoint and UI |
| Unsaved changes | No warning | `beforeunload` handler |
| Unpublished profiles | Filtered client-side | Filtered server-side in MongoDB query |

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
- NextAuth v4 documentation: https://next-auth.js.org/getting-started/introduction
- Auth.js v5 (NextAuth v5): https://authjs.dev
- Google Web.dev – Skeleton screens: https://web.dev/articles/ux-improvements-for-pwa#skeleton-screens
