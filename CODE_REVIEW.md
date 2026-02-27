# Code Review: Simionic G1000 Custom Profiles (Next.js)

**Reviewed:** February 2026 (fresh review — all previous reviews discarded)  
**Stack:** Next.js 16 / React 19 / MongoDB / Auth.js v5 beta / Argon2 / Nodemailer  
**Scope:** Full codebase — security, architecture, implementation, UI/usability

---

## Executive Summary

This is a Next.js web application that lets users browse, create, edit, import, and export Garmin G1000 custom aircraft profiles stored in MongoDB. Authentication uses local credentials with Argon2 password hashing and JWT sessions via Auth.js v5.

It's a working application that has had some meaningful work done to address common security concerns — CSRF middleware, rate limiting, Zod schema validation, SRI on CDN resources, and security headers are all present. The codebase shows evidence of previous review cycles having fixed real problems.

That said, several of the fixes are incomplete or have introduced new issues. There is a significant amount of dead code left behind, the middleware contains a logical bug, the `registerUser` function has a race condition, search input is vulnerable to regex injection, and some content pages are factually outdated. The UI has keyboard accessibility gaps and some poor mobile UX patterns.

This review covers everything I found, organised by severity within each category.

---

## 1. Security

### 1.1 MongoDB Regex Injection via Search — **HIGH**

**File:** `src/lib/data-store.ts` lines 46–51

User-supplied search terms are split on whitespace and passed directly into MongoDB `$regex` without escaping regex metacharacters:

```ts
{ Name: { $regex: term, $options: "i" } },
{ "Owner.Name": { $regex: term, $options: "i" } },
```

A user can submit search terms containing regex metacharacters (`.*+?^${}()|[]\`) which will be interpreted as regex. This has two consequences:

1. **Unexpected query behaviour:** A search for `C++` would fail or match incorrectly because `+` is a regex quantifier.
2. **ReDoS potential:** A carefully crafted regex pattern can cause catastrophic backtracking, blocking the MongoDB query thread.

**Fix:** Escape all regex special characters before interpolation, e.g. `term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`, or use a MongoDB text index with `$text` search instead.

> **Reference:** OWASP A03:2021 – Injection; CWE-1333 (Inefficient Regular Expression Complexity).

---

### 1.2 CSRF Middleware NextAuth Skip Logic Is Dead Code — **HIGH**

**File:** `src/middleware.ts` lines 21–24

The middleware attempts to skip CSRF checks for NextAuth routes:

```ts
if (request.nextUrl.pathname.startsWith("/api/auth/") &&
    request.nextUrl.pathname.includes("[...nextauth]") ||
    request.nextUrl.pathname.match(/^\/api\/auth\/[^/]*nextauth/)) {
```

`[...nextauth]` is a Next.js filesystem routing convention. It never appears in the actual request URL. The URLs are `/api/auth/callback/credentials`, `/api/auth/session`, etc. Neither condition ever matches.

This means NextAuth's own POST endpoints (sign-in, sign-out, session) are subject to the Origin header check. In practice, browser same-origin requests include a matching Origin header, so this doesn't currently break anything — but the logic is misleading and the comment claims it "skips NextAuth's own routes" when it does not.

Additionally, the operator precedence is wrong: `A && B || C` is parsed as `(A && B) || C`, not `A && (B || C)`. The regex fallback `C` runs unconditionally.

**Fix:** Replace with a simple pathname prefix check for the paths NextAuth actually uses, or remove the skip entirely since NextAuth's routes work fine with the Origin check.

> **Reference:** Next.js App Router – Route Handlers documentation.

---

### 1.3 `registerUser` Has a Race Condition — **MEDIUM**

**File:** `src/lib/user-service.ts` lines 29–41

```ts
const existing = await findUserByEmail(email);
if (existing) throw new ConflictError(...);
const user = await createUser(email, name.trim(), passwordHash);
```

This is a classic check-then-act race. Two concurrent registration requests for the same email can both pass the `findUserByEmail` check. One `createUser` call will succeed; the other will throw a `MongoServerError` (code 11000) from the unique index. This error is **not caught** by `registerUser` — it propagates as an unhandled 500 error instead of a 409 Conflict.

The `createUserIdempotent` function in `user-store.ts` handles this pattern correctly (catching code 11000), but `registerUser` does not use it.

**Fix:** Either use `createUserIdempotent` in `registerUser`, or add a `try/catch` for `MongoServerError` code 11000 that rethrows as `ConflictError`.

> **Reference:** CWE-362 (Concurrent Execution using Shared Resource with Improper Synchronization); MongoDB Unique Index documentation.

---

### 1.4 Rate Limiter Trusts Spoofable `x-forwarded-for` Header — **MEDIUM**

**File:** `src/lib/rate-limit.ts` lines 72–80

```ts
const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
if (forwarded) return forwarded;
```

The rate limiter uses the first entry in `x-forwarded-for` as the client identifier. If the app is not behind a trusted reverse proxy that strips or overwrites this header, an attacker can bypass rate limiting entirely by sending a different `x-forwarded-for` value with each request.

**Fix:** Document the deployment requirement for a trusted reverse proxy. Alternatively, in the rate limiter, use a combination of IP and other request fingerprint data, or integrate with the hosting platform's rate limiting (e.g., Vercel Edge, Cloudflare).

> **Reference:** OWASP HTTP Headers Cheat Sheet; MDN X-Forwarded-For.

---

### 1.5 No Password Strength Checking Beyond Length — **LOW**

**Files:** All auth API routes, all auth pages

The only password validation is `password.length < 8`. While NIST SP 800-63B no longer mandates complexity rules, it **does** recommend checking passwords against common breach dictionaries. An 8-character password like `password` or `12345678` passes validation.

**Fix:** Check submitted passwords against a list of common/breached passwords (e.g., the Have I Been Pwned top 1,000 list shipped as a static file).

> **Reference:** NIST SP 800-63B §5.1.1.2.

---

### 1.6 Account Conversion Flow Lacks Atomicity — **MEDIUM**

**File:** `src/lib/user-service.ts` lines 107–154

`completeConversion` performs `createUserIdempotent`, `updateProfileOwner`, and `markConversionTokenUsed` as three separate database operations. A crash between steps can leave the system in an inconsistent state. The idempotent retry logic mitigates some failure modes, but the fundamental issue is that these three operations are not atomic.

**Fix:** Wrap all three operations in a MongoDB multi-document transaction.

> **Reference:** MongoDB Transactions documentation.

---

### 1.7 `dangerouslySetInnerHTML` in FAQ Page — **LOW**

**File:** `src/app/faq/page.tsx` line 88

```tsx
dangerouslySetInnerHTML={{ __html: para }}
```

FAQ answer paragraphs are rendered with `dangerouslySetInnerHTML`. The content is currently hardcoded strings, so there is no XSS risk today. However, this pattern is a landmine — if FAQ content is ever loaded from a database, CMS, or user input, it becomes a direct XSS vector.

**Fix:** Replace inline HTML in the FAQ data with React components or a safe markdown renderer. The current HTML consists only of `<a>` tags, which could be handled with a simple link-replacement function.

> **Reference:** React documentation on `dangerouslySetInnerHTML`; CWE-79.

---

## 2. Architecture and Design

### 2.1 Significant Dead Code Remains — **HIGH**

**File:** `src/lib/profile-utils.ts` lines 48–115

The following exported functions are never imported or called anywhere in the codebase:

- `filterByPublished`
- `filterByType`
- `filterByEngineCount`
- `filterByOwner`
- `filterBySearch`
- `filterProfiles`

These were the client-side filter functions from before server-side pagination was implemented in `data-store.ts`. They are now completely dead code.

Additionally:

- The `PublishedStatus` enum in `src/types/enums.ts` is only used by `filterProfiles` — also dead.
- The `GaugeType` enum in `src/types/enums.ts` is never referenced anywhere. The `GaugeDisplay` component uses string literals for its `gaugeType` prop.
- The `ForkedFrom` field was removed from the TypeScript types but still exists in the sample JSON at `src/samples/2b73437f-aed3-4fa1-b1cc-0e21323775b0.json`.

Dead code is not just untidy — it actively misleads developers trying to understand the codebase.

**Fix:** Delete all of the above.

---

### 2.2 Field-Mapping Layer Is Fragile — **MEDIUM**

**File:** `src/lib/field-mapping.ts`

The bidirectional `camelToPascal` / `pascalToCamel` mapping uses an explicit map object. There is no compile-time or runtime check that all fields in the `Profile` type are present in the map. If a field is added to the Zod schema or TypeScript type but not to the map:

- Importing a PascalCase file will leave the field with its PascalCase key, which won't match the camelCase Zod schema, causing silent data loss (Zod `.strip()` removes unknown keys).
- Exporting a profile will leave the field in camelCase, which the iPad app may not recognise.

**Fix:** Add an exhaustiveness check (e.g., a type-level mapped type or a runtime test that verifies all `Profile` keys appear in the map).

---

### 2.3 No Error Boundary or `error.tsx` — **MEDIUM**

The app has no `error.tsx` files anywhere in the route tree. If any server component or client component throws during render, users see a raw white screen or a cryptic Next.js error page. Next.js provides `error.tsx` as a dedicated mechanism for this.

**Fix:** Add at minimum a root `src/app/error.tsx` with a user-friendly fallback UI and a retry button.

> **Reference:** Next.js documentation – Error Handling.

---

### 2.4 MongoDB Development Connection Has No Error Handling — **LOW**

**File:** `src/lib/mongodb.ts` lines 21–25

```ts
if (process.env.NODE_ENV === "development") {
  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(MONGODB_URI);
    globalWithMongo._mongoClientPromise = client.connect();
    // ← no .catch() handler
  }
```

In production mode, `client.connect()` has a `.catch()` handler that logs the error. In development mode, it does not. If MongoDB is not running locally during `npm run dev`, the error is an unhandled promise rejection.

**Fix:** Add the same `.catch()` handler in the development branch.

---

### 2.5 `ensureIndexes` Runs on Every Request — **LOW**

**Files:** `src/lib/user-store.ts`, `src/lib/token-store.ts`

The `ensureIndexes()` / `ensureResetIndexes()` / `ensureConversionIndexes()` functions are called before every single database operation. They are guarded by a module-level boolean, so `createIndex` is only called once per process lifetime. However, the guard check itself adds a small overhead to every request, and the pattern scatters index management across multiple files.

**Fix:** Ensure indexes once at application startup (e.g., in a server initialization hook) rather than lazily on first access.

---

### 2.6 Profile Export Doesn't Sanitize Filenames — **LOW**

**File:** `src/lib/export.ts` line 17

```ts
a.download = `${profile.name}.json`;
```

The profile name is used directly as the download filename. If the name contains characters like `/`, `\`, `..`, or OS-reserved names like `CON`, `NUL`, etc., the download may fail or behave unexpectedly. The `sanitize-filename` package is already a dependency (used in `fake-email-service.ts`) but is not used here.

**Fix:** `a.download = sanitize(\`${profile.name}.json\`)`.

---

## 3. Implementation

### 3.1 No Debounce on Profile List Search — **MEDIUM**

**File:** `src/app/profiles/ProfileListContent.tsx`

The `useEffect` that fetches profiles runs on every change to `searchTerm`, which updates on every keystroke:

```ts
useEffect(() => { fetchProfiles(); }, [typeFilter, engineFilter, searchTerm, ...]);
```

Typing "Cessna" triggers six API calls (`C`, `Ce`, `Ces`, `Cess`, `Cessn`, `Cessna`). Most will return useless intermediate results. With server-side search this is sending six queries to MongoDB.

**Fix:** Debounce the search term (e.g., 300ms) before triggering the fetch. A simple `setTimeout`/`clearTimeout` in the effect is sufficient.

---

### 3.2 `Notice.tsx` Duplicates the Search Input — **LOW**

**File:** `src/components/Notice.tsx` lines 38–53

Two separate `<input>` elements are rendered — one visible on mobile (`d-sm-none`), one on desktop (`d-none d-sm-inline`) — both controlled by the same state. This means two DOM elements are always mounted and receiving state updates. A single input with responsive width classes would suffice.

---

### 3.3 `beforeunload` Warning Fires Without Actual Changes — **LOW**

**File:** `src/app/profile/[id]/ProfilePageContent.tsx` lines 70–78

The `beforeunload` listener fires whenever `editing === true && profile !== null`, regardless of whether any edits have been made. A user who enters edit mode and immediately navigates away (without changing anything) gets a spurious warning.

**Fix:** Track a `dirty` flag (set `true` on first `setProfile` call after entering edit mode) and only register the `beforeunload` handler when `dirty`.

---

### 3.4 Colour Picker and User Menu Dropdowns Don't Close on Outside Click — **LOW**

**Files:** `src/components/GaugeDisplay.tsx` (ColourIndicator), `src/components/Navbar.tsx`

Both the colour picker dropdown and the user menu dropdown only close when a specific button/option is clicked. Clicking anywhere else on the page leaves them open. Standard dropdown behaviour is to close on outside click.

**Fix:** Add a `mousedown` event listener on `document` (or use a React ref + `useEffect` pattern) that closes the dropdown when a click lands outside it.

---

### 3.5 Numeric Input Coercion on Empty — **LOW**

**Files:** `src/components/ProfileEditor.tsx` line 33, `src/components/GaugeDisplay.tsx` line 79

When a user clears a numeric field, `value === "" ? 0 : Number(value)` sets the value to `0`. The inputs already use `type="number"`, so browsers provide native validation, but the controlled state jumps to `0` on clear. This prevents users from fully clearing a field before typing a new value — the `0` appears immediately.

**Fix:** Allow empty string as a valid intermediate state, only coercing to `0` on blur or on save.

---

## 4. UI and Usability

### 4.1 FAQ Content Is Factually Outdated — **HIGH**

**File:** `src/app/faq/page.tsx`

Several FAQ entries are factually wrong given the current state of the application:

- **"Do I have to log in to use this site?"** — The answer says "you need to log in using a personal Microsoft Account." The app now uses local credentials (email + password).
- **"Why do I have to use a Microsoft Account? Why a personal one?"** — This entire entry is no longer relevant. The app no longer uses Microsoft Accounts.
- **"Does the site store my personal data, such as passwords?"** — The answer says "The site does not store any passwords or sensitive data." The app now stores password hashes via Argon2. The answer is misleading.

Outdated FAQ content erodes user trust and creates confusion.

**Fix:** Rewrite the FAQ to reflect the current authentication system.

---

### 4.2 Privacy Policy Is Outdated — **HIGH**

**File:** `src/app/privacy/page.tsx`

The privacy policy says "(This notice updated March 1 2022)" and states that the only personal information collected is "Your name (as provided via the Microsoft Account you use to log into this site)."

The app now collects and stores:

- Email address
- Display name
- Password hash (Argon2)
- IP addresses (used in rate limiting, though not persisted to disk)

The privacy policy fails to disclose email and password hash storage, and still references the defunct Microsoft Account login. Depending on jurisdiction, this may create legal compliance issues (GDPR, CCPA).

**Fix:** Update the privacy policy to accurately reflect current data collection practices.

---

### 4.3 Keyboard Accessibility Gaps — **MEDIUM**

**File:** `src/components/GaugeDisplay.tsx`

The colour indicator buttons are `<div>` elements with `onClick` handlers. They are not focusable via keyboard and have no `role`, `tabIndex`, or `onKeyDown` handlers. The dropdown items (`<li><div>`) are similarly inaccessible.

The profile cards in `ProfileCard.tsx` use a `<div>` with `onClick` and `cursor: pointer` — they look clickable but are not keyboard-navigable.

**Fix:** Use `<button>` elements for all interactive controls, or add `role="button"`, `tabIndex={0}`, and keyboard event handlers.

> **Reference:** WCAG 2.1 – 2.1.1 Keyboard; WAI-ARIA Authoring Practices.

---

### 4.4 Mobile Responsiveness Is Poor in the Editor — **MEDIUM**

**File:** `src/components/ProfileEditor.tsx`

The gauge editor uses fixed Bootstrap column widths (`col-3`, `col-9`, `col-1`, `col-2`) that don't stack or reflow on small screens. The V-speed inputs use `col-1`, which is approximately 8.3% of the viewport width — on a 375px mobile screen, that's about 31 pixels wide, which is unusable.

The vacuum PSI section has inline labels and multiple inputs on one line with no responsive breakpoints.

**Fix:** Use responsive column classes (`col-12 col-md-3`) so the layout stacks vertically on mobile.

---

### 4.5 Import Error Handling Discards Server Error Messages — **LOW**

**File:** `src/app/import/page.tsx` line 54

```ts
} catch {
  setError(true);
```

When profile import fails, the catch block discards the actual error. The API might return a 400 with a specific Zod validation error, but the user sees only "An error occurred uploading the file. Are you sure this is a valid profile JSON file?" — which provides no useful debugging information.

**Fix:** Read the response body and display the server's error message.

---

### 4.6 No Indication of Loading State During Profile Fetch — **LOW**

**File:** `src/app/profile/[id]/ProfilePageContent.tsx`

When fetching a profile by ID (not the "new" case), there is no loading indicator. The page shows only the heading "Loading..." as the `profile?.name` fallback in the `<h3>`. There is no spinner or skeleton.

---

## 5. Summary Table

| # | Issue | Severity | Area |
|---|---|---|---|
| 1.1 | MongoDB regex injection via search | HIGH | Security |
| 1.2 | CSRF middleware NextAuth skip logic is dead code with a precedence bug | HIGH | Security |
| 1.3 | `registerUser` race condition on concurrent registrations | MEDIUM | Security |
| 1.4 | Rate limiter trusts spoofable `x-forwarded-for` | MEDIUM | Security |
| 1.5 | No password strength checking beyond length | LOW | Security |
| 1.6 | Account conversion flow lacks atomicity | MEDIUM | Security |
| 1.7 | `dangerouslySetInnerHTML` in FAQ | LOW | Security |
| 2.1 | Significant dead code: 6 filter functions, 2 enums, stale sample data | HIGH | Architecture |
| 2.2 | Field-mapping layer has no exhaustiveness check | MEDIUM | Architecture |
| 2.3 | No `error.tsx` error boundary | MEDIUM | Architecture |
| 2.4 | MongoDB dev connection has no error handler | LOW | Architecture |
| 2.5 | `ensureIndexes` runs on every request | LOW | Architecture |
| 2.6 | Profile export doesn't sanitize filenames | LOW | Architecture |
| 3.1 | No debounce on search — 1 API call per keystroke | MEDIUM | Implementation |
| 3.2 | `Notice.tsx` duplicates the search input element | LOW | Implementation |
| 3.3 | `beforeunload` warning fires without actual changes | LOW | Implementation |
| 3.4 | Dropdowns don't close on outside click | LOW | Implementation |
| 3.5 | Numeric input coercion on empty (`"" → 0`) | LOW | Implementation |
| 4.1 | FAQ content is factually outdated (still references Microsoft Account) | HIGH | UI/Usability |
| 4.2 | Privacy policy is outdated and legally inaccurate | HIGH | UI/Usability |
| 4.3 | Keyboard accessibility gaps (non-focusable interactive elements) | MEDIUM | UI/Usability |
| 4.4 | Mobile responsiveness is poor in the profile editor | MEDIUM | UI/Usability |
| 4.5 | Import error handling discards server error messages | LOW | UI/Usability |
| 4.6 | No loading indicator during profile fetch | LOW | UI/Usability |

---

## Sources

- OWASP Top 10 (2021): https://owasp.org/www-project-top-ten/
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Input Validation Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- NIST SP 800-63B (Digital Identity Guidelines): https://pages.nist.gov/800-63-3/sp800-63b.html
- MDN X-Forwarded-For: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For
- MongoDB Unique Indexes: https://www.mongodb.com/docs/manual/core/index-unique/
- MongoDB Transactions: https://www.mongodb.com/docs/manual/core/transactions/
- CWE-362 Race Condition: https://cwe.mitre.org/data/definitions/362.html
- CWE-1333 Inefficient Regular Expression Complexity: https://cwe.mitre.org/data/definitions/1333.html
- CWE-79 Cross-site Scripting: https://cwe.mitre.org/data/definitions/79.html
- React – dangerouslySetInnerHTML: https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html
- Next.js – Error Handling: https://nextjs.org/docs/app/building-your-application/routing/error-handling
- Next.js – Route Handlers: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- WCAG 2.1 – Keyboard Accessible: https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html
- WAI-ARIA Authoring Practices: https://www.w3.org/WAI/ARIA/apg/

