# Code Review — Simionic G1000 Custom Profiles

**Reviewer:** Copilot  
**Date:** 2026-03-16  
**Scope:** Full codebase — security, correctness, and code quality

---

## Summary

The codebase is well-structured with a clear three-layer architecture (API routes → Services → Data stores) and has numerous security-conscious design decisions in place: Argon2id password hashing, token hashing, zero-disclosure endpoints, and rate limiting on most auth flows. There is meaningful test coverage.

However, several issues were found, ranging from a critical missing security layer to minor design nits. They are ranked below from most to least severe. This document proposes a remediation plan and asks the owner to decide which items to address.

---

## Issues Ranked by Severity

---

### 🔴 CRITICAL

---

#### C-1. `src/middleware.ts` does not exist — CSRF protection and CSP are absent

The project specification (in the Copilot instructions and `docs/implementation.md`) states that `src/middleware.ts` must check the `Origin` header on all mutating API calls (`POST`, `PUT`, `DELETE`, `PATCH` to `/api/*`) for CSRF protection, and must generate a per-request nonce for the `Content-Security-Policy` header. **Neither of these things exists in the codebase.**

**CSRF impact:** Without the Origin header check, cross-origin requests can be forged. The session cookie is `SameSite=Lax`, which prevents cookies from being sent in cross-origin `fetch()`/XHR calls, so the practical risk is low in most browser environments. However, `SameSite=Lax` has known edge cases (e.g. cross-origin form POST navigations via `<form method="POST">` DO send the cookie), and defence-in-depth via the Origin header is standard practice. The spec explicitly requires this.

**CSP impact:** No `Content-Security-Policy` header is sent anywhere. The app loads Bootstrap Icons from an external CDN (`cdn.jsdelivr.net`) and uses Bootstrap CSS from local files. Without a CSP, browsers offer no XSS mitigation. React prevents most DOM-based XSS, but a missing CSP is still a gap in any defence-in-depth strategy.

**Plan:**
- Implement `src/middleware.ts` that runs on the Edge runtime and:
  1. Checks the `Origin` (or `Referer`) header on `POST`, `PUT`, `DELETE`, `PATCH` requests to `/api/*` and returns `403` if the origin doesn't match the configured `APP_URL`.
  2. Generates a per-request random `nonce` and sets a strict `Content-Security-Policy` header using that nonce. The nonce must be injected into `<script>` tags in the layout (via `headers()` or a server component) so that Next.js-generated scripts still execute.

---

### 🔴 HIGH

---

#### H-1. Draft profiles are visible to anyone who knows the profile ID

**File:** `src/app/api/profiles/[id]/route.ts`, `src/lib/profile-service.ts`, `src/lib/data-store.ts`

The `GET /api/profiles/[id]` handler calls `getProfileById()` which calls `getProfile()`. This returns the full profile document regardless of its `isPublished` flag, with no authentication check. Any caller who knows a profile's UUID can read it, even if the owner has kept it as a draft (`isPublished=false`).

The spec (functional spec AC-PROFILE-VIEW) states that published profiles are visible to all and draft profiles are visible only to their owner.

UUIDs are randomly generated and computationally infeasible to guess, so the practical risk is limited. However, this is a clear access-control bug that violates the stated spec.

```typescript
// Current — no auth check, returns anything
export async function GET(_request, { params }) {
  const { id } = await params;
  const profile = await getProfileById(id);   // returns drafts to everyone
  return NextResponse.json(profile);
}
```

**Plan:**
- In the `GET /api/profiles/[id]` handler, retrieve the session (`await auth()`).
- If the profile is not published **and** the caller is not the owner, return `404` (not `403`, to avoid confirming the profile exists).

---

#### H-2. No rate limiting on the sign-in endpoint

**File:** `src/app/api/auth/[...nextauth]/route.ts`

The sign-in endpoint (`POST /api/auth/[...nextauth]`) is handled directly by NextAuth.js and has no rate limiting. All other auth endpoints (register, forgot-password, reset-password, convert/request, convert/complete) have rate limits, but sign-in is conspicuously absent.

An attacker can make unlimited password-attempt requests, enabling brute-force and credential-stuffing attacks. Argon2id is expensive to compute, which provides some inherent slowdown (~several hundred ms per attempt), but a distributed attack from multiple machines can still be effective, especially against users with weak passwords that slipped past the common-password blocklist.

**Plan:**
- Wrap the NextAuth handlers with a rate-limiting shim, or add a sign-in-specific middleware matcher. A limit of 10 attempts per 15 minutes per IP is a reasonable starting point, consistent with the other limits.
- Alternatively, implement account lockout after N failed attempts (more complex but more targeted).

---

#### H-3. Bootstrap Icons loaded from CDN without Subresource Integrity (SRI)

**File:** `src/app/layout.tsx`, line 25

```tsx
<link
  href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.5.0/font/bootstrap-icons.css"
  rel="stylesheet"
  crossOrigin="anonymous"
/>
```

The `crossOrigin="anonymous"` attribute is present but there is no `integrity` attribute. Without an SRI hash, the browser will accept whatever the CDN serves, including a tampered version. If `cdn.jsdelivr.net` is compromised or the specific version is poisoned, malicious CSS could be injected. (CSS injection can be used for data exfiltration and UI manipulation.)

**Plan:**
- Add the `integrity` attribute with the SHA-384 hash of the specific CSS file. The hash can be obtained from https://www.srihash.org or the CDN itself.
- Alternatively, download the CSS file and serve it locally (eliminates the third-party dependency entirely).

---

### 🟡 MEDIUM

---

#### M-1. `pbkdf2Sync` blocks the Node.js event loop

**File:** `src/lib/owner-id.ts`, line 19

```typescript
const derived = pbkdf2Sync(email, CRYPTO_SALT, CRYPTO_ITERATIONS, CRYPTO_BYTES, "sha1");
```

`pbkdf2Sync` is synchronous and runs 100,000 iterations. It is called from `completeConversion()` inside an async function, blocking the entire Node.js event loop for the duration of the computation (typically 50–200ms on modern hardware). During that window, no other requests can be handled.

Because this is only used during the legacy Microsoft account conversion flow, which should be a one-off, low-frequency operation, the real-world impact is limited. However, if a handful of users trigger conversion simultaneously, or if the function is called during a slow server period, it will cause noticeable request stalls.

**Plan:**
- Replace `pbkdf2Sync` with the async `pbkdf2` (promisified) from `node:crypto`, or use `crypto.subtle.deriveBits` (Web Crypto API, available in Node.js 18+) which runs off the main thread.

---

#### M-2. No rate limiting on `GET /api/auth/convert/check`

**File:** `src/app/api/auth/convert/check/route.ts`

This endpoint accepts any string as a token and performs a database lookup. It has no rate limiting or authentication. While the SHA-256 hash space makes brute-forcing tokens infeasible (2²⁵⁶ combinations), the endpoint can be abused to generate high database query load, and its existence as an unauthenticated, un-rate-limited endpoint is inconsistent with the security posture of the rest of the API.

**Plan:**
- Add rate limiting (e.g., 20 requests per 15 minutes per IP) using `rateLimit` + `getClientIp`, consistent with the other auth endpoints.

---

#### M-3. `createResetCode` does not invalidate previous tokens for the same email

**File:** `src/lib/token-store.ts`

Each call to `createResetCode` inserts a new token document. There is no logic to delete or invalidate existing valid tokens for the same email before inserting the new one. This means a user who requests two password resets within 15 minutes ends up with two valid tokens simultaneously — either can be used.

While this is unlikely to be exploited (an attacker would need to intercept an earlier email), it is not best practice. Password reset best practices recommend that issuing a new token invalidates all previous tokens.

**Plan:**
- Before inserting a new reset code, `deleteMany` any non-expired, non-used records for the same email in `password_reset_codes`.

---

#### M-4. Two separate `ValidationError` classes with the same name

**Files:** `src/lib/user-service.ts` (line 16) and `src/lib/profile-service.ts` (line 19)

Both modules export a class called `ValidationError`. They are distinct classes — `catch (e instanceof ValidationError)` in a context that imports from `profile-service` will **not** catch a `ValidationError` thrown by `user-service`. This is not currently a bug (the API routes import from the correct module), but it is a maintenance trap that is likely to cause a subtle runtime error in future.

**Plan:**
- Extract a shared `ValidationError` (and potentially `NotFoundError`, `ForbiddenError`, `ConflictError`, `InconsistentStateError`) into a single `src/lib/errors.ts` module and import from there everywhere.

---

#### M-5. No maximum password length enforced

**Files:** `src/app/api/auth/register/route.ts` (line 37), `src/app/api/auth/reset-password/route.ts` (line 33)

Both endpoints enforce a minimum password length of 8 characters but no maximum. Argon2id in the `argon2` npm package does have an internal limit (the C library caps inputs at 4,294,967,295 bytes, which is not a real concern), but passing extremely long strings still requires memory allocation and hashing time proportional to input length. A 100KB+ password string would cause a visible, though brief, processing spike.

**Plan:**
- Add a server-side maximum password length check (e.g., 1024 characters) with an appropriate `400` response. This is consistent with NIST SP 800-63B §5.1.1.2 guidance that recommends supporting passwords of at least 64 characters but allows an upper bound.

---

#### M-6. `session.ownerId ?? ""` may silently save a profile owned by empty string

**File:** `src/app/api/profiles/[id]/route.ts`, lines 58 and 76

```typescript
await saveProfile(id, body, session.ownerId ?? "", ...);
await deleteProfileById(id, session.ownerId ?? "");
```

If `session.ownerId` is `undefined` for any reason (e.g., a NextAuth.js bug or JWT token corruption), the fallback `""` is passed as the owner ID. A new profile would then be saved with `owner.id = ""`, and any future authenticated user with a legitimate empty-ownerId session (however unlikely) could delete it.

The auth callback in `src/lib/auth.ts` does set `token.ownerId` to the user's UUID for every valid login, so this is an edge case. But a proper guard — returning `401` if `session.ownerId` is not a non-empty string — would make the invariant explicit and eliminate the `""` escape hatch.

**Plan:**
- Replace `session.ownerId ?? ""` with an explicit check: if `!session.ownerId`, return `401 Unauthorized` before proceeding.

---

### 🟢 LOW

---

#### L-1. `DELETE /api/profiles/[id]` returns HTTP 200 instead of 204

**File:** `src/app/api/profiles/[id]/route.ts`, line 77

```typescript
return NextResponse.json({ success: true });  // should be 204 No Content
```

REST convention is `204 No Content` for a successful deletion with no body. This is a minor API design inconsistency, not a functional or security issue.

**Plan:** Change to `return new NextResponse(null, { status: 204 })`.

---

#### L-2. `POST /api/profiles/[id]` always returns HTTP 200 for both create and update

**File:** `src/app/api/profiles/[id]/route.ts`, line 59

```typescript
return NextResponse.json({ success: true });  // should be 201 on create
```

REST convention for resource creation is `201 Created`. The endpoint uses an upsert internally, so distinguishing create from update requires checking whether a prior document existed.

**Plan:** In `saveProfile` (or the API handler), track whether the upsert was an insert or update and return `201` vs `200` accordingly.

---

#### L-3. `common-passwords.ts` uses `process.cwd()` for file resolution — fragile

**File:** `src/lib/common-passwords.ts`, line 12

```typescript
const filePath = join(process.cwd(), "src/lib/common-passwords.txt");
```

If the server is started from a directory other than the project root, the file won't be found and the minimal hardcoded fallback list (40 passwords) will be used silently instead of the full list. The only indication is a caught exception that swallows the error without logging.

**Plan:**
- Log a warning when the file can't be found: `console.warn("common-passwords.txt not found; using minimal fallback")`.
- Consider using `__dirname` / `import.meta.url` for a path relative to the source file itself, or ensure the file is bundled into the build output.

---

#### L-4. `getConversionToken` uses the wrong function name in `check` route

**File:** `src/app/api/auth/convert/check/route.ts`, line 2 and 15

```typescript
import { getConversionToken } from "@/lib/token-store";
const conversionToken = await getConversionToken(token);
```

`getConversionToken` (defined in `token-store.ts`) is the correct function to use here — it returns a valid, unused, non-expired token. This is fine. However, in `user-service.ts`, `completeConversion` uses `findConversionToken` (which also returns used tokens, to handle idempotent retries). The naming is slightly inconsistent and the distinction is non-obvious.

**Plan:** Add a JSDoc comment on `findConversionToken` and `getConversionToken` clarifying which is for the check route and which is for the conversion flow. No code change required.

---

#### L-5. The `APP_URL` environment variable has no validation or documented format requirement

**File:** `src/lib/user-service.ts`, lines 48–52 and 90

The `APP_URL` variable is used to construct password-reset and conversion links with no validation that the URL is well-formed or uses HTTPS. A misconfigured or `http://`-only URL would produce insecure reset links. The code warns if `APP_URL` is absent but doesn't validate it.

**Plan:**
- At startup (in `instrumentation.ts` or `mongodb.ts`), warn if `APP_URL` is not set or does not start with `https://` in production.

---

## Items NOT Considered Issues

The following were considered and found to be acceptable as-is:

- **In-memory rate limiter:** The project specification acknowledges single-instance, low-traffic deployment. The in-memory limiter is appropriate. Redis would be needed only if horizontal scaling is required in future.
- **Email validation regex:** Not RFC 5322 compliant, but practical. The important check (email actually works) happens when the user receives the email.
- **SameSite=Lax (not Strict):** `Lax` is appropriate here because the site needs to receive the session cookie on top-level navigations from other sites (e.g., a user clicking a link to a profile from another website). `Strict` would require the user to log in again on every such navigation.
- **Zero-disclosure on `resetPassword` in `user-service.ts`:** Although the function does check whether the email exists first, it returns the same error message ("Invalid or expired code.") for both "email not found" and "token invalid", so no information is leaked.
- **`getUserFriendlyError` utility:** This function IS used in `ProfilePageContent.tsx` and is therefore not dead code.
- **Token re-use prevention for conversion tokens:** This is already handled: `verifyResetCode` and `markConversionTokenUsed` use atomic `findOneAndUpdate` to prevent double-use.
- **Email casing in conversion tokens:** The non-lowercase storage of email in conversion tokens is intentional and documented — it is required to produce the correct PBKDF2-derived owner ID that matches legacy profile documents.

---

## Remediation Plan Summary

| # | Severity | Issue | Effort |
|---|----------|-------|--------|
| C-1 | 🔴 Critical | Implement `src/middleware.ts` (CSRF + CSP) | High |
| H-1 | 🔴 High | Access control: hide draft profiles from non-owners | Low |
| H-2 | 🔴 High | Rate-limit the sign-in endpoint | Medium |
| H-3 | 🔴 High | Add SRI hash to Bootstrap Icons CDN link | Low |
| M-1 | 🟡 Medium | Replace `pbkdf2Sync` with async equivalent | Low |
| M-2 | 🟡 Medium | Rate-limit `GET /api/auth/convert/check` | Low |
| M-3 | 🟡 Medium | Invalidate previous reset tokens on new request | Low |
| M-4 | 🟡 Medium | Consolidate `ValidationError` into shared module | Medium |
| M-5 | 🟡 Medium | Enforce maximum password length | Low |
| M-6 | 🟡 Medium | Guard against empty `ownerId` in profile routes | Low |
| L-1 | 🟢 Low | Return 204 from DELETE | Low |
| L-2 | 🟢 Low | Return 201 from POST on create | Low |
| L-3 | 🟢 Low | Log warning when common-passwords.txt is missing | Low |
| L-4 | 🟢 Low | Clarify `getConversionToken` vs `findConversionToken` naming | Low |
| L-5 | 🟢 Low | Validate `APP_URL` format at startup | Low |

---

## Questions for the Owner

1. **C-1 (middleware):** Should the middleware be implemented fully (CSRF + CSP with nonce), or just one of the two? The CSP nonce approach requires changes to `layout.tsx` to inject the nonce into `<script>` tags, which is non-trivial. Do you want the full implementation or just the Origin-header CSRF check to begin with?

2. **H-1 (draft visibility):** Should the `GET /api/profiles/[id]` endpoint return `404` for drafts the caller doesn't own (hiding their existence), or `403` (admitting they exist but are private)? `404` is the more security-conscious choice.

3. **H-2 (sign-in rate limit):** A per-IP rate limit is straightforward but relies on `TRUST_PROXY` being set correctly. Would you prefer a per-email lockout approach instead (requires tracking failed attempts in the database)?

4. **H-3 (SRI):** Should the Bootstrap Icons CSS be hosted locally (removes CDN dependency entirely) or should just the `integrity` hash be added?

5. **Priority:** Which of the above issues would you like addressed, and in what order? All Critical and High items are strongly recommended. The Medium items are good practice. The Low items are optional polish.
