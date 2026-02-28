# Code Review — Simionic G1000 Custom Profiles (Next.js)

**Reviewed:** 2026-02-28  
**Reviewer:** Copilot Agent (realistic-analyst mode)

---

## Re-review of ISSUE-1: Nonce-Based CSP

**Original issue:** `'unsafe-inline'` in `script-src` Content Security Policy  
**Re-reviewed:** 2026-02-28

### Background (for readers unfamiliar with React/Next.js)

Think of a web page as a document the server sends to your browser. Embedded in that document are JavaScript programs (`<script>` tags) that make the page interactive. A **Content Security Policy (CSP)** is an HTTP response header that tells the browser: "only run scripts from these approved sources; refuse all others." This is what stops an attacker from injecting malicious scripts into pages.

**Nonce-based CSP** works like a one-time password: the server generates a random secret (the "nonce") for each page load and embeds it in the CSP header. Every `<script>` tag in the page must carry the same secret. The browser refuses to execute any script without the matching secret. This means even if an attacker injects a `<script>` tag, it won't run — it doesn't have the secret.

**Next.js** (the framework used here) generates its own internal script tags during page rendering (for "hydration" — the process that makes the page interactive after delivery). These internal scripts need to have the nonce too. Next.js 14+ has a built-in mechanism: if the middleware sets the `content-security-policy` header on the **incoming request** (not just the outgoing response), Next.js will automatically extract the nonce from it and inject it into its own script tags. This is exactly what the middleware does.

### Current State

**`src/middleware.ts`** correctly:
- Generates a cryptographically random nonce on every request
- Builds a CSP using `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'` — **no `'unsafe-inline'`**
- Sets the CSP on the **request** headers, triggering Next.js's automatic nonce injection into its own script tags
- Sets `Content-Security-Policy` on the **response** headers, which the browser enforces

**`next.config.ts`** does not include a CSP header (it is handled entirely by the middleware, which is correct).

### Verdict

**ISSUE-1 is resolved.** `'unsafe-inline'` is gone from `script-src`. An injected `<script>` tag without the correct nonce will be blocked by the browser. The nonce mechanism is correctly implemented.

**One cleanup was applied:** `src/app/layout.tsx` previously read the `x-nonce` request header into a `const nonce` variable that was never used in any JSX (there are no `<Script>` components or inline `<script>` tags in the layout). This was dead code that caused a lint warning (`'nonce' is assigned a value but never used`). The variable and its associated `import { headers }` statement have been removed, and the layout function changed from `async` back to synchronous. The nonce mechanism is unaffected — it is fully handled by the middleware.

---

## Fresh Review — Issues Found

---

### ISSUE-1 — Authorization Bypass: Draft Profiles Accessible Without Authentication

**Severity:** High  
**Files:** `src/app/api/profiles/route.ts`, `src/lib/data-store.ts`  
**Status:** Fixed

**What the code was doing:**

The profile list API endpoint (`GET /api/profiles`) accepts an `owner` query parameter. When this parameter is present, the database query returns all profiles belonging to that owner — including unpublished drafts — with no authentication check.

The data filtering logic in `src/lib/data-store.ts` was:

```ts
if (params.owner) {
  if (params.drafts) {
    andConditions.push({ IsPublished: false, "Owner.Id": params.owner });
  } else {
    andConditions.push({ $or: [{ IsPublished: true }, { "Owner.Id": params.owner }] });
  }
} else {
  andConditions.push({ IsPublished: true });
}
```

And the API route handler in `src/app/api/profiles/route.ts` passed the `owner` parameter directly from the URL to this function without checking who was making the request:

```ts
const owner = searchParams.get("owner") ?? undefined;
// ...
const result = await getAllProfiles({ ..., owner, drafts: drafts || undefined, ... });
```

**Why this is a problem (explained simply):**

Imagine you have a word processor that lets you save documents as "public" (anyone can read them) or "draft" (private, only you can see them). Now imagine someone can go to a specific web address — `https://yourapp.com/api/profiles?owner=YOUR_ID` — and get a list of all your documents, including your private drafts. That is exactly what this code allowed.

Any person on the internet, without logging in, could call this API URL and see the draft (unpublished) profiles of any user whose owner ID they knew. Getting the owner ID was also trivial: published profiles expose the author's `owner.id` in their data. So an attacker would:
1. Browse the public profile list, which exposes `owner.id` for any published profile
2. Call `GET /api/profiles?owner=<that-id>` and receive all the victim's profiles, including drafts they chose not to publish

**The fix:**

`src/app/api/profiles/route.ts` now checks the caller's session before allowing owner-filtered results. If the caller is not authenticated as the requested owner, the `owner` and `drafts` parameters are silently dropped and only published profiles are returned. This means the URL still works — it just returns only public data for unauthenticated or wrong-user callers — which avoids breaking any embedded links.

```ts
let resolvedOwner = owner;
let resolvedDrafts: boolean | undefined = drafts || undefined;
if (owner !== undefined) {
  const session = await auth();
  if (session?.ownerId !== owner) {
    resolvedOwner = undefined;
    resolvedDrafts = undefined;
  }
}
```

---

### ISSUE-2 — Missing `name` Max-Length Validation in Account Conversion

**Severity:** Low  
**File:** `src/app/api/auth/convert/complete/route.ts`  
**Status:** Fixed

**What the code was doing:**

The account conversion endpoint allowed a user to set a display name of arbitrary length. The validation was:

```ts
if (!name.trim()) {
  return NextResponse.json({ error: "Name is required." }, { status: 400 });
}
```

This only checks that the name is non-empty. It does not enforce a maximum length.

**Why this is a problem:**

The registration endpoint (`src/app/api/auth/register/route.ts`) correctly limits display names to 200 characters. The conversion endpoint had the same field but without the same limit, creating an inconsistency. A user going through the conversion flow could supply an arbitrarily long display name (e.g., 100,000 characters), which would be stored in the database and returned in every API response where profile owner information is included.

**The fix:**

Added the same max-length check that already existed in the registration endpoint:

```ts
if (!name.trim()) {
  return NextResponse.json({ error: "Name is required." }, { status: 400 });
}
if (name.length > 200) {
  return NextResponse.json({ error: "Name must be 200 characters or fewer." }, { status: 400 });
}
```

---

## Issues Noted but Not Recommended for Fixing

### In-Memory Rate Limiter (`src/lib/rate-limit.ts`)

The rate limiter stores request timestamps in a module-level `Map`. This means rate limits are per-instance: in a multi-instance deployment (e.g. Vercel Serverless or a replicated container), each instance has independent state and the limits are easily bypassed by making requests to different instances. The code comments acknowledge this.

This is a structural limitation, not a code defect. Fixing it properly requires replacing the in-memory store with a shared, persistent store (e.g. Redis or a MongoDB TTL collection), which is a significant architectural change. This is flagged for awareness and left to the project owner to address when the deployment scale warrants it.

### Manual `<link>` CSS Tags in `layout.tsx`

`src/app/layout.tsx` uses `<link>` tags to include CSS files served from `/public/css/`. The Next.js linter (`@next/next/no-css-tags`) recommends importing CSS as JavaScript modules instead, which allows Next.js to handle bundling and code-splitting. However, CSS files served from `/public` cannot be imported as JavaScript modules — they are static assets that must be referenced via `<link>` tags. There is no better approach given the current file layout. Lint-disable comments have been added to suppress the spurious warnings.

---

## Checklist

| # | Issue | Severity | File(s) | Status |
|---|-------|----------|---------|--------|
| 1 | Authorization bypass: draft profiles accessible without auth | High | `src/app/api/profiles/route.ts` | Fixed |
| 2 | Missing `name` max-length in account conversion | Low | `src/app/api/auth/convert/complete/route.ts` | Fixed |
