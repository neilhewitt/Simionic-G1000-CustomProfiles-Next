# Code Review: Simionic G1000 Custom Profiles (Next.js)

**Reviewed:** February 2026 (updated — issues verified against current codebase)  
**Stack:** Next.js 16 / React 19 / MongoDB / Auth.js v5 beta / Argon2 / Nodemailer  
**Scope:** Full codebase — security, architecture, implementation, UI/usability

---

## Executive Summary

This is a Next.js web application that lets users browse, create, edit, import, and export Garmin G1000 custom aircraft profiles stored in MongoDB. Authentication uses local credentials with Argon2 password hashing and JWT sessions via Auth.js v5.

Significant progress has been made since the last review. Of the 23 issues previously identified, 19 have been fully fixed and verified:

- The CSRF middleware dead code and operator-precedence bug are gone.
- The `registerUser` race condition is resolved by using `createUserIdempotent` directly.
- MongoDB regex injection is fixed with correct metacharacter escaping.
- All dead code (filter functions, unused enums, stale sample JSON) has been removed.
- The field-mapping layer now has a compile-time exhaustiveness check.
- A root `error.tsx` has been added.
- The FAQ and privacy policy have been rewritten to reflect the current authentication system.
- Keyboard accessibility gaps in `GaugeDisplay.tsx` and `ProfileCard.tsx` are addressed.
- Search debouncing, duplicate DOM inputs, filename sanitization, loading indicators, and import error messages have all been fixed.
- A common-passwords blocklist has been added and integrated into all auth routes.

Eight issues remain: five carried over from the previous review (some now partially addressed), and three newly identified issues.

---

## 1. Security

### 1.1 Rate Limiter Trusts Spoofable `x-forwarded-for` Header — **MEDIUM**

**File:** `src/lib/rate-limit.ts` lines 79–81

```ts
const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
if (forwarded) return forwarded;
```

The rate limiter uses the first entry in `x-forwarded-for` as the client identifier. A prominent comment now documents the deployment requirement for a trusted reverse proxy. However, the code itself is unchanged: if the app is deployed without such a proxy, an attacker can bypass rate limiting by rotating spoofed `x-forwarded-for` values with each request.

The documentation is a meaningful improvement but does not eliminate the vulnerability for deployments that don't comply with the requirement.

**Fix:** Enforce this at the infrastructure level (Vercel, Cloudflare, Nginx `real_ip_from`). Alternatively, accept a configurable trusted-proxy CIDR from an environment variable and only trust `x-forwarded-for` when the underlying connection IP falls within it.

> **Reference:** OWASP HTTP Headers Cheat Sheet; MDN X-Forwarded-For.

---

### 1.2 Common Passwords Blocklist Is Too Small — **LOW**

**File:** `src/lib/common-passwords.ts`

A common-passwords check has been added and is correctly wired into all three auth routes (`register`, `reset-password`, `convert/complete`). However, the blocklist contains only approximately 50 entries. The original fix recommendation was "the Have I Been Pwned top 1,000 list shipped as a static file." Many prevalent weak passwords (`abc123`, `letmein1`, `passw0rd1`, `password2024`, etc.) are absent.

**Fix:** Replace the hand-curated list with the top-1,000 (or top-10,000) entries from the HaveIBeenPwned Pwned Passwords dataset, shipped as a static newline-delimited `.txt` file loaded at module initialisation.

> **Reference:** NIST SP 800-63B §5.1.1.2; HaveIBeenPwned Pwned Passwords.

---

### 1.3 Account Conversion Flow Lacks Atomicity — **MEDIUM**

**File:** `src/lib/user-service.ts` lines 131–157

`completeConversion` still performs `createUserIdempotent`, `updateProfileOwner`, and `markConversionTokenUsed` as three separate database operations. A comment in the code accurately describes the risk and explains the idempotent mitigation strategy, but the operations remain non-atomic.

A crash after `createUserIdempotent` but before `markConversionTokenUsed` leaves the token in an unused state; a retry will create a second user record (or find the existing one) but re-run `updateProfileOwner`, which is idempotent, so the outcome is survivable. A crash after `updateProfileOwner` but before `markConversionTokenUsed` is similarly recoverable. The `InconsistentStateError` path correctly handles the case where the token is marked used but no user exists. In practice the risk is low, but the code comment itself acknowledges that wrapping in a transaction is the correct fix.

**Fix:** Wrap all three operations in a MongoDB multi-document transaction using `session.withTransaction()`. This requires a replica set or Atlas cluster (not a standalone `mongod`).

> **Reference:** MongoDB Transactions documentation; CWE-362.

---

## 2. Architecture and Design

### 2.1 `ensureIndexes` Runs on Every Request — **LOW**

**Files:** `src/lib/user-store.ts`, `src/lib/token-store.ts`

The `ensureIndexes()` / `ensureResetIndexes()` / `ensureConversionIndexes()` functions are called before every database operation. They are guarded by module-level booleans, so `createIndex` is only called once per process lifetime. However, each call still evaluates the boolean guard, and the pattern scatters index management across multiple files.

**Fix:** Ensure indexes once at application startup (e.g., in a server initialisation hook or a dedicated `src/lib/init.ts` called from the top level) rather than lazily before each operation.

---

### 2.2 `app/error.tsx` Does Not Cover Root Layout Errors — **LOW**

**File:** `src/app/error.tsx`

A root `error.tsx` now exists and provides a user-friendly fallback with a retry button. However, Next.js's `error.tsx` only catches errors thrown within its route segment's subtree — it does not catch errors thrown within `app/layout.tsx` itself (e.g., a crash in `SessionProvider` or the top-level `<html>` wrapper).

For complete error coverage at the layout level, Next.js provides a separate `global-error.tsx` mechanism. Without it, a crash in the root layout produces a raw browser error page regardless of the `error.tsx` present.

**Fix:** Add `src/app/global-error.tsx` alongside the existing `error.tsx`. It must include its own `<html>` and `<body>` tags.

> **Reference:** Next.js documentation – Error Handling (global-error.js).

---

## 3. Implementation

### 3.1 Numeric Input Coercion on Empty — **LOW**

**File:** `src/components/ProfileEditor.tsx` line 33

`GaugeDisplay.tsx` has been correctly fixed: gauge range values use a draft state that allows empty strings as an intermediate, only coercing to `0` on blur.

`ProfileEditor.tsx` has not received the same fix. The `parseNum` helper still returns `0` for an empty string:

```ts
function parseNum(value: string): number | null {
  const num = value === "" ? 0 : Number(value);
  return isNaN(num) ? null : num;
}
```

This function is used for V-speed inputs, vacuum PSI range, trim take-off ranges, and flap positions. Clearing any of these fields immediately shows `0` in the control — the user cannot fully clear a field before typing a new value.

**Fix:** Apply the same pattern used in `GaugeDisplay.tsx`: allow `null` or empty string as an intermediate state in `onChange`, only setting to `0` in an `onBlur` handler.

---

### 3.2 `dirty` Flag Misses Profile Name and Published Status Changes — **LOW**

**File:** `src/app/profile/[id]/ProfilePageContent.tsx` lines 285–288, 256–262

The `dirty` flag is correctly set in the `ProfileEditor` `onChange` callback. However, two editable fields in `ProfilePageContent` itself call `setProfile` without calling `setDirty(true)`:

1. **Profile name input** (`onChange` at line ~286) — calls `setProfile({ ...profile, name: e.target.value })` only.
2. **Published / Draft toggle buttons** (`onClick` at lines ~256, ~262) — call `setProfile({ ...profile, isPublished: false/true })` only.

A user who enters edit mode, changes the profile name or toggles the published status, and then navigates away will not see a `beforeunload` warning. The changes are silently lost.

**Fix:** Add `setDirty(true)` alongside `setProfile(...)` in both the name input's `onChange` handler and the published/draft toggle button `onClick` handlers.

---

## 4. UI and Usability

### 4.1 Mobile Responsiveness Is Still Poor in Parts of the Editor — **MEDIUM**

**File:** `src/components/ProfileEditor.tsx`

The aircraft type, cylinders, FADEC, temperature scale, and other top-level rows have been updated to use responsive column classes (`col-12 col-md-3`, `col-12 col-md-9`) and now stack correctly on small screens.

However, the following sections are unchanged and remain broken on mobile:

- **V-speed inputs** (lines ~356–393) — Each label/input pair uses `col-1` (≈8.3% viewport width). On a 375 px mobile screen this is approximately 31 px, which is completely unusable.
- **Vacuum PSI section** (lines ~219–241) — Uses `col-2` and `col-md-auto` with multiple inline label/input pairs. There are no stacking breakpoints.
- **Flap markings and positions** (lines ~302–353) — Use `col-2` and `col-8` without breakpoints.

**Fix:** Apply the same `col-12 col-md-N` responsive pattern to the V-speeds, vacuum PSI, and flap sections. The V-speeds in particular need a complete rethink of their horizontal layout — consider stacking them two or three per row on mobile.

---

## 5. Summary Table

| # | Issue | Severity | Area |
|---|---|---|---|
| 1.1 | Rate limiter trusts spoofable `x-forwarded-for` (deployment requirement documented, code unchanged) | MEDIUM | Security |
| 1.2 | Common passwords blocklist is very small (~50 entries vs. recommended 1,000+) | LOW | Security |
| 1.3 | Account conversion flow lacks atomicity (risk documented, transaction not implemented) | MEDIUM | Security |
| 2.1 | `ensureIndexes` runs on every request | LOW | Architecture |
| 2.2 | `app/error.tsx` does not cover root layout errors (no `global-error.tsx`) | LOW | Architecture |
| 3.1 | Numeric input coercion on empty (`"" → 0`) in `ProfileEditor.tsx` | LOW | Implementation |
| 3.2 | `dirty` flag not set when changing profile name or published status | LOW | Implementation |
| 4.1 | Mobile responsiveness still poor in V-speed, vacuum PSI, and flap sections | MEDIUM | UI/Usability |

---

## Sources

- OWASP Top 10 (2021): https://owasp.org/www-project-top-ten/
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- NIST SP 800-63B (Digital Identity Guidelines): https://pages.nist.gov/800-63-3/sp800-63b.html
- HaveIBeenPwned Pwned Passwords: https://haveibeenpwned.com/Passwords
- MDN X-Forwarded-For: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For
- MongoDB Transactions: https://www.mongodb.com/docs/manual/core/transactions/
- CWE-362 Race Condition: https://cwe.mitre.org/data/definitions/362.html
- Next.js – Error Handling: https://nextjs.org/docs/app/building-your-application/routing/error-handling
- WCAG 2.1 – Keyboard Accessible: https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html

