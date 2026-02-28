# Code Review — Simionic G1000 Custom Profiles (Next.js)

**Reviewed:** 2026-02-28  
**Reviewer:** Copilot Agent (realistic-analyst mode)

---

## Summary

The codebase is broadly in decent shape for a community web app. Auth flows are thoughtfully designed with zero-disclosure where appropriate, Zod schema validation is applied at the API boundary, and there's at least some rate limiting and CSRF protection in place. That said, there are real, exploitable security gaps, several code quality issues, and a handful of unnecessary rough edges that should be fixed. They are ranked below from most to least severe.

---

## Issues Found

---

### ISSUE-1 — `'unsafe-inline'` in `script-src` Content Security Policy

**Severity:** Critical  
**File:** `next.config.ts`, line 12  

```ts
"script-src 'self' 'unsafe-inline'",
```

`'unsafe-inline'` in `script-src` allows any inline `<script>` block on any page to execute. This entirely neutralises XSS protection from the CSP. If an attacker manages to inject content into any rendered page (through a stored profile name, notes, owner name, or a future feature), they can execute arbitrary JavaScript in the victim's browser.

Next.js requires some inline scripting for hydration, which is why this appears here. The correct fix is to implement a nonce-based CSP: Next.js generates a random nonce per request, injects it into all its own script tags, and the CSP is set to allow only scripts bearing that nonce. The `'unsafe-inline'` keyword must then be removed.

**Agent prompt to fix:**

> In `next.config.ts`, implement a nonce-based Content Security Policy so that `'unsafe-inline'` can be removed from the `script-src` directive.
>
> Specifically:
> 1. In `next.config.ts`, change the `Content-Security-Policy` value for `script-src` to `'self' 'nonce-{nonce}'` (where `{nonce}` is the placeholder that Next.js replaces at runtime). Use `'strict-dynamic'` so that scripts loaded by trusted scripts are also allowed. Remove `'unsafe-inline'` from `script-src`.
> 2. In `src/middleware.ts`, generate a cryptographically random nonce (using `crypto.randomUUID()` or `randomBytes`) on every request, inject it into the `Content-Security-Policy` response header (replacing the `{nonce}` placeholder), and also set it as a request header (e.g. `x-nonce`) so that server components can read it.
> 3. In `src/app/layout.tsx`, read the `x-nonce` request header and pass it to the Next.js `<Script>` component's `nonce` prop, and add `nonce={nonce}` to any inline `<script>` tags.
> 4. Ensure the updated middleware still performs origin-check CSRF protection for mutating methods (existing behaviour must not be broken).
> 5. Run `npm run lint` and `npm run build` and confirm they pass.
>
> Reference: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy

---

### ISSUE-2 — Missing `Strict-Transport-Security` (HSTS) Header

**Severity:** High  
**File:** `next.config.ts`, `securityHeaders` array  

The security headers set `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`, but there is no `Strict-Transport-Security` header. Without HSTS, browsers will not enforce HTTPS on repeat visits, leaving the connection open to protocol downgrade (SSL-stripping) attacks where an active network attacker forces a plaintext HTTP connection to intercept credentials or session tokens.

**Agent prompt to fix:**

> In `next.config.ts`, add a `Strict-Transport-Security` header to the `securityHeaders` array.
>
> The value should be `max-age=63072000; includeSubDomains; preload` (two years). Add it as the first entry in the array so it is easy to see alongside the other security headers. Do not modify any other header or any other file.
>
> Run `npm run lint` and confirm it passes.

---

### ISSUE-3 — Conversion Token Uses `randomUUID()` Instead of `randomBytes(32)`

**Severity:** High  
**File:** `src/lib/token-store.ts`, line 109  

```ts
const token = randomUUID();
```

The password reset token (line 43, same file) correctly uses `randomBytes(32).toString("hex")`, giving 256 bits of entropy. The conversion token uses `randomUUID()`, which only provides 122 bits of random entropy (UUID v4 has fixed bits for version and variant). This is inconsistent and unnecessarily weaker. For a token embedded in an email link that grants the ability to take over a user's profile ownership, there is no reason to accept less entropy than the password reset token.

**Agent prompt to fix:**

> In `src/lib/token-store.ts`, change the `createConversionToken` function so that the token is generated using `randomBytes(32).toString("hex")` instead of `randomUUID()`.
>
> The import `randomUUID` at line 2 can be removed if it is no longer used anywhere else in the file; check before removing it. The only change required is to line 109: replace `const token = randomUUID();` with `const token = randomBytes(32).toString("hex");`. No other files need to change.
>
> Run `npm run lint` and confirm it passes.

---

### ISSUE-4 — No Server-Side Email Format Validation on Registration

**Severity:** High  
**File:** `src/app/api/auth/register/route.ts`, lines 33–35  

```ts
if (!email || typeof email !== "string") {
  return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
}
```

The API only checks that `email` is a non-empty string. It does not validate that the value is a syntactically valid email address. An API client (bypassing the browser's `<input type="email">`) can register with any arbitrary string — `"not-an-email"`, `"a@b"`, etc. This pollutes the database and means those accounts cannot receive password-reset emails (because there is no valid address to send to). The same gap exists in `src/app/api/auth/forgot-password/route.ts` and `src/app/api/auth/convert/request/route.ts`.

**Agent prompt to fix:**

> Add server-side email format validation to the following API route handlers: `src/app/api/auth/register/route.ts`, `src/app/api/auth/forgot-password/route.ts`, and `src/app/api/auth/convert/request/route.ts`.
>
> Do not add a new dependency. Use a simple, well-known RFC 5321–compatible regex such as `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Create a small helper function `isValidEmail(email: string): boolean` in `src/lib/user-service.ts` (or a new `src/lib/validation.ts` file) that applies this check, and call it from each route handler immediately after confirming the value is a string.
>
> In `register/route.ts`, return a 400 with `{ error: "Valid email is required." }` if the check fails.  
> In `forgot-password/route.ts` and `convert/request/route.ts`, which use zero-disclosure responses, return the zero-disclosure response unchanged (do not reveal whether the format was invalid — an attacker should learn nothing from the response).
>
> Run `npm run lint` and confirm it passes.

---

### ISSUE-5 — Artificial 1500 ms Delay in Import Page

**Severity:** Medium  
**File:** `src/app/import/page.tsx`, line 62  

```ts
await new Promise((resolve) => setTimeout(resolve, 1500));
```

After a successful API upload, the code waits 1.5 seconds before redirecting to the editor. There is no technical reason for this delay; the upload is already complete. The effect is that users sit watching a spinner for a second and a half for no benefit. This is just bad UX.

**Agent prompt to fix:**

> In `src/app/import/page.tsx`, remove the line `await new Promise((resolve) => setTimeout(resolve, 1500));` (line 62). The redirect to `/profile/${newId}?edit=true` should happen immediately after `setUploading(false)`. Do not change any other logic in the file.
>
> Run `npm run lint` and confirm it passes.

---

### ISSUE-6 — `error.tsx` Exports Its Component as `GlobalError`

**Severity:** Medium  
**File:** `src/app/error.tsx`, line 8  

```ts
export default function GlobalError({ error, reset }: ErrorProps) {
```

The file is `error.tsx` — Next.js's route-segment error boundary, not the global error page. The global error page is `global-error.tsx`. Both files happen to export a function named `GlobalError`, which is confusing and incorrect in the case of `error.tsx`. Next.js cares only about the default export, not the function name, so this does not break anything — but it makes the code misleading and harder to maintain.

**Agent prompt to fix:**

> In `src/app/error.tsx` only, rename the exported default function from `GlobalError` to `ErrorPage` (or just `Error`). The signature and body of the function must not change. `src/app/global-error.tsx` is correct as-is and must not be touched.
>
> Run `npm run lint` and confirm it passes.

---

### ISSUE-7 — Profile Name Input Has No `maxLength` Attribute

**Severity:** Medium  
**File:** `src/app/profile/[id]/ProfilePageContent.tsx`, line 282  

```tsx
<input
  type="text"
  className="form-control d-inline-block w-auto ms-2"
  value={profile.name}
  onChange={...}
  disabled={!editing}
/>
```

The Zod schema (`src/lib/profile-schema.ts`, line 61) enforces `max(200)` on profile names server-side, and the `<textarea>` for Notes has `maxLength={2000}`. But the profile name `<input>` has no `maxLength`, so users can type an arbitrarily long name, see it accepted by the UI, and only get an error when they hit save. This is an inconsistent, poor UX.

**Agent prompt to fix:**

> In `src/app/profile/[id]/ProfilePageContent.tsx`, add `maxLength={200}` to the profile name `<input>` element (around line 282). Do not change any other attribute or any other file.
>
> Run `npm run lint` and confirm it passes.

---

### ISSUE-8 — `convert/request` Throttle Response Missing `Retry-After` Header

**Severity:** Low  
**File:** `src/app/api/auth/convert/request/route.ts`, lines 11–13  

```ts
if (!rl.success) {
  return NextResponse.json(ZERO_DISCLOSURE);
}
```

The `forgot-password` endpoint (which uses the same zero-disclosure pattern) correctly adds a `Retry-After: 900` header when throttled:

```ts
return NextResponse.json(ZERO_DISCLOSURE, { headers: { "Retry-After": "900" } });
```

The `convert/request` endpoint omits this header. While the 200 status is intentional, `Retry-After` is useful for well-behaved clients and automated tools to know when to retry. The inconsistency is a minor defect.

**Agent prompt to fix:**

> In `src/app/api/auth/convert/request/route.ts`, change the rate-limit block (lines 11–13) so that the throttled response includes a `Retry-After: 900` header, matching the pattern used in `src/app/api/auth/forgot-password/route.ts`.
>
> Change:
> ```ts
> return NextResponse.json(ZERO_DISCLOSURE);
> ```
> to:
> ```ts
> return NextResponse.json(ZERO_DISCLOSURE, { headers: { "Retry-After": "900" } });
> ```
>
> Do not modify any other file. Run `npm run lint` and confirm it passes.

---

### ISSUE-9 — Unused `skipped` Variable in Migration Script

**Severity:** Low  
**File:** `scripts/migrate-to-mongo.ts`, line 34  

```ts
const skipped = 0;
```

`skipped` is declared, never incremented, and then printed in the final summary. It will always log `Skipped: 0`. This is dead code and suggests the logic to detect and skip already-imported profiles was never implemented (or was removed and the variable left behind). The declared `const` also prevents reassignment even if someone tries to fix it.

**Agent prompt to fix:**

> In `scripts/migrate-to-mongo.ts`, either:
> (a) Remove the `skipped` variable entirely and remove it from the final `console.log` call, OR  
> (b) Change `const skipped = 0` to `let skipped = 0` and add logic to detect existing documents (using `findOne({ id })`) and increment `skipped` instead of upserting when the document already exists.
>
> Option (b) is preferred as it makes the summary log meaningful. If you implement (b), the `updateOne` upsert should become a conditional: check for an existing document first; if it exists, increment `skipped` and continue; if not, do the `insertOne`. Do not change any other file.
>
> Run `npm run lint` and confirm it passes.

---

### ISSUE-10 — No File Size Guard Before JSON.parse in Import Page

**Severity:** Low  
**File:** `src/app/import/page.tsx`, line 31  

```ts
const text = await file.text();
const parsed = JSON.parse(text);
```

There is no check on the file size before reading its full content into memory and calling `JSON.parse`. A malicious authenticated user could upload a 500 MB JSON file and trigger a multi-second parse on the client (not a server concern since this is client-side), potentially hanging or crashing the browser tab. Legitimate profile JSON files are typically a few kilobytes.

**Agent prompt to fix:**

> In `src/app/import/page.tsx`, add a file size check immediately after `const file = e.target.files?.[0];`. If `file.size` exceeds 1 MB (i.e. `1 * 1024 * 1024` bytes), set an appropriate error message (`"File is too large. Profile files should be a few kilobytes at most."`) and return early without parsing. Use the existing `setError` state setter to display the error.
>
> Do not change any other file. Run `npm run lint` and confirm it passes.

---

## Issues Noted but Not Recommended for Fixing

### In-Memory Rate Limiter (`src/lib/rate-limit.ts`)

The rate limiter stores request timestamps in a module-level `Map`. This means rate limits are per-instance: in a multi-instance deployment (e.g. Vercel Serverless or a replicated container), each instance has independent state and the limits are easily bypassed by making requests to different instances. The code comments acknowledge this.

This is a structural limitation, not a code defect. Fixing it properly requires replacing the in-memory store with a shared, persistent store (e.g. Redis or a MongoDB TTL collection), which is a significant architectural change. This is flagged for awareness and left to the project owner to address when the deployment scale warrants it.

---

## Checklist

| # | Issue | Severity | File(s) |
|---|-------|----------|---------|
| 1 | `'unsafe-inline'` in `script-src` CSP | Critical | `next.config.ts` |
| 2 | Missing HSTS header | High | `next.config.ts` |
| 3 | Conversion token uses `randomUUID()` not `randomBytes(32)` | High | `src/lib/token-store.ts` |
| 4 | No server-side email format validation | High | `src/app/api/auth/register/route.ts`, `forgot-password/route.ts`, `convert/request/route.ts` |
| 5 | Artificial 1500ms delay in import | Medium | `src/app/import/page.tsx` |
| 6 | `error.tsx` exports component named `GlobalError` | Medium | `src/app/error.tsx` |
| 7 | Profile name input missing `maxLength` | Medium | `src/app/profile/[id]/ProfilePageContent.tsx` |
| 8 | `convert/request` throttle missing `Retry-After` header | Low | `src/app/api/auth/convert/request/route.ts` |
| 9 | Unused `skipped` variable in migration script | Low | `scripts/migrate-to-mongo.ts` |
| 10 | No file size guard before `JSON.parse` in import | Low | `src/app/import/page.tsx` |
