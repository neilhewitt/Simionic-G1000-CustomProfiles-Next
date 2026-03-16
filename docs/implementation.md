# Implementation Guide

This document provides a detailed walkthrough of the application's implementation for developers with Next.js experience. It covers the code structure, data models, API design, authentication flow, and key patterns used throughout the codebase.

---

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [TypeScript Types](#typescript-types)
3. [Data Models](#data-models)
4. [MongoDB Client](#mongodb-client)
5. [Data Store Layer](#data-store-layer)
6. [Service Layer](#service-layer)
7. [API Routes](#api-routes)
8. [Authentication Implementation](#authentication-implementation)
9. [Rate Limiting](#rate-limiting)
10. [Email Service](#email-service)
11. [Token Management](#token-management)
12. [Middleware](#middleware)
13. [Profile Utilities](#profile-utilities)
14. [Field Mapping](#field-mapping)
15. [Zod Validation Schema](#zod-validation-schema)
16. [Startup Initialization](#startup-initialization)
17. [React Components](#react-components)
18. [Migration Script](#migration-script)
19. [Testing](#testing)

---

## Environment Variables

All required configuration is passed via environment variables. In development these live in `.env.local`; in production they are set in the server environment or a process manager configuration file.

| Variable          | Required | Default         | Purpose                                      |
|-------------------|----------|-----------------|----------------------------------------------|
| `NEXTAUTH_URL`    | Recommended | —            | Canonical URL of the app for deployments that need it |
| `NEXTAUTH_SECRET` | Yes      | —               | Random secret for JWT signing (min 32 chars) |
| `APP_URL`         | Recommended in development, effectively required in production for correct email links | — | Base URL used in password-reset and conversion emails |
| `MONGODB_URI`     | Yes      | —               | MongoDB connection string                    |
| `MONGODB_DB`      | No       | `simionic`      | Database name                                |
| `EMAIL_PROVIDER`  | No       | `fake`          | `smtp` or `fake`                             |
| `SMTP_HOST`       | If smtp  | —               | SMTP server hostname                         |
| `SMTP_PORT`       | If smtp  | —               | SMTP server port (e.g. `587`)                |
| `SMTP_USER`       | If smtp  | —               | SMTP auth username                           |
| `SMTP_PASS`       | If smtp  | —               | SMTP auth password                           |
| `SMTP_FROM`       | If smtp  | —               | Sender address (e.g. `noreply@example.com`)  |
| `TRUST_PROXY`     | No       | `false`         | Trust `X-Forwarded-For` for rate-limit IPs   |

`NEXTAUTH_SECRET` is validated at import time in `src/lib/auth.ts` — the process throws immediately at startup if it is missing.

`MONGODB_URI` is validated at import time in `src/lib/mongodb.ts`.

`APP_URL` is checked at startup in `src/instrumentation.ts`. In production, the app logs a warning if `APP_URL` is missing, malformed, or does not use `https://`.

---

## TypeScript Types

All domain types live under `src/types/`. They are re-exported from `src/types/index.ts` so consumers can import from a single path.

### `enums.ts`

```typescript
enum AircraftType { Piston = 0, Turboprop = 1, Jet = 2 }
enum RangeColour  { None = 0, Green = 1, Yellow = 2, Red = 3 }
```

Integer values match the Simionic app's JSON format exactly.

### `gauge.ts`

```typescript
interface GaugeRange {
  id?:            string;        // stable UUID, backfilled on first load
  colour:         RangeColour;   // 0-3
  min:            number;
  max:            number;
  allowDecimals?: boolean;
}

interface Gauge {
  name:                  string;
  min:                   number | null;
  max:                   number | null;
  fuelInGallons?:        boolean | null;    // Fuel gauge only
  capacityForSingleTank?: number | null;    // Fuel gauge only
  torqueInFootPounds?:   boolean | null;    // Torque gauge only
  maxPower?:             number | null;     // Torque gauge only
  ranges:                GaugeRange[];     // always 4 entries
  allowDecimals:         boolean;
}
```

Every gauge has exactly **4** colour ranges (enforced by Zod). Unused ranges have `colour: RangeColour.None`.

### `profile.ts`

Two structural variants are used:

```typescript
interface NewProfile  extends BaseProfile { id: null }    // not yet saved
interface SavedProfile extends BaseProfile { id: string } // has a UUID
type Profile = NewProfile | SavedProfile;
```

`ProfileSummary` is a lightweight subset returned by the list API (no gauge data):

```typescript
interface ProfileSummary {
  id: string;
  owner: OwnerInfo;       // { id: string|null, name: string|null }
  lastUpdated: string;    // ISO 8601
  name: string;
  aircraftType: AircraftType;
  engines: number;        // 1 | 2
  isPublished: boolean;
  notes: string | null;
}
```

### `next-auth.d.ts`

Augments the NextAuth `Session` interface to expose `ownerId`:

```typescript
declare module "next-auth" {
  interface Session {
    ownerId?: string;
  }
}
```

---

## Data Models

### Profile document (MongoDB)

Stored in the `profiles` collection. Fields use PascalCase to match the Simionic app's JSON export format.

```
{
  id:           string          // UUID (unique index)
  Owner: {
    Id:         string | null
    Name:       string | null
  }
  LastUpdated:  string          // ISO 8601
  Name:         string
  AircraftType: 0 | 1 | 2      // Piston | Turboprop | Jet
  Engines:      1 | 2
  IsPublished:  boolean
  Notes:        string | null

  // --- Piston-only ---
  // Non-piston imports may use 0 because cylinders are not applicable.
  Cylinders:    0 | 4 | 6
  Fadec:        boolean
  Turbocharged: boolean
  ConstantSpeed: boolean
  VacuumPSIRange: { Min, Max, GreenStart, GreenEnd }
  ManifoldPressure: <Gauge>
  CHT:          <Gauge>
  EGT:          <Gauge>
  TIT:          <Gauge>
  Load:         <Gauge>

  // --- Turboprop-only ---
  Torque:       <Gauge>
  NG:           <Gauge>

  // --- Turboprop + Jet ---
  ITT:          <Gauge>

  // --- Common to all ---
  TemperaturesInFahrenheit: boolean
  RPM:          <Gauge>
  Fuel:         <Gauge>
  FuelFlow:     <Gauge>
  OilPressure:  <Gauge>
  OilTemperature: <Gauge>

  DisplayElevatorTrim:     boolean
  ElevatorTrimTakeOffRange: { Min, Max }
  DisplayRudderTrim:       boolean
  RudderTrimTakeOffRange:  { Min, Max }
  DisplayFlapsIndicator:   boolean
  FlapsRange: {
    Markings:   (string | null)[]   // 6 entries
    Positions:  (number | null)[]   // 6 entries
  }
  VSpeeds: { Vs0, Vs1, Vfe, Vno, Vne, Vglide, Vr, Vx, Vy }
}
```

A `<Gauge>` sub-document looks like:

```
{
  Name:   string
  Min:    number | null
  Max:    number | null
  Ranges: [
    { Colour: 0-3, Min: n, Max: n, AllowDecimals?: bool }  // x4
  ]
  AllowDecimals: boolean
  // optional gauge-specific fields:
  FuelInGallons?:       boolean | null
  CapacityForSingleTank?: number | null
  TorqueInFootPounds?:  boolean | null
  MaxPower?:            number | null
}
```

### User document (MongoDB)

```
{
  email:        string    // lowercase, unique index
  name:         string
  passwordHash: string    // Argon2id hash
  ownerId:      string    // UUID, indexed
  createdAt:    Date
}
```

### Token documents (MongoDB)

**`password_reset_codes`:**

```
{
  email:     string
  codeHash:  string    // SHA-256 hex of raw token
  expiresAt: Date      // TTL index — MongoDB auto-deletes at expiry
  used:      boolean
}
```

**`conversion_tokens`:**

```
{
  email:      string
  tokenHash:  string   // SHA-256 hex of raw token, unique index
  expiresAt:  Date     // TTL index
  used:       boolean
}
```

---

## MongoDB Client

`src/lib/mongodb.ts` exports a singleton `MongoClient` promise and a `getDb()` helper.

```
Development environment:
  - Client is stored on globalThis to survive hot-module reloads
  - Re-uses the same connection across reloads

Production environment:
  - A single client is created once at module load time
```

Usage throughout the app:

```typescript
import { getDb } from "@/lib/mongodb";

const db = await getDb();                       // returns the Db instance
const col = db.collection("profiles");
```

Connection errors are logged and re-thrown. There is no retry logic; if MongoDB is unavailable the process will throw on startup and requests will fail with 500.

---

## Data Store Layer

`src/lib/data-store.ts` is the only file that imports from `mongodb.ts` for profile operations. All functions are async and return typed results.

### `getAllProfiles(params)`

Builds a MongoDB filter from query parameters and returns paginated `ProfileSummary` objects.

Query filter construction:

```
params.owner + params.drafts
  -> owner present and requesting own drafts:
       { IsPublished: false, "Owner.Id": owner }
  -> owner present but not drafts:
       { $or: [{ IsPublished: true }, { "Owner.Id": owner }] }
  -> no owner:
       { IsPublished: true }

params.type   -> { AircraftType: type }
params.engines -> { Engines: engines }
params.search  -> split on whitespace/comma, each term adds:
       { $or: [{ Name: /term/i }, { "Owner.Name": /term/i }] }

All conditions joined with $and
```

Pagination: `skip = (page - 1) * limit`, `limit = min(100, max(1, limit ?? 20))`.

Returns only the fields needed for `ProfileSummary` via MongoDB projection (no gauge data).

Result documents are passed through `toCamelCase()` before being returned.

### `getProfile(id)`

Fetches a single full profile by UUID, passes through `toCamelCase()`, and calls `fixUpGauges()` to backfill range IDs and decimal flags before returning.

### `upsertProfile(id, profile)`

Converts the profile to PascalCase with `toPascalCase()`, sets `LastUpdated` to the current ISO timestamp, and performs a MongoDB `updateOne` with `upsert: true`. The lowercase `id` field is re-set after case conversion (since `toPascalCase` would capitalise it to `Id`). Returns `true` when MongoDB reports an insert and `false` when it reports an update.

### `deleteProfile(id)`

Performs a `deleteOne` and returns `true` if a document was deleted.

### `updateProfileOwner(oldOwnerId, newOwnerId, newOwnerName, session?)`

Updates `Owner.Id` and `Owner.Name` on all profiles matching `oldOwnerId`. Accepts an optional MongoDB `ClientSession` for use within a transaction. Returns the number of modified documents.

---

## Service Layer

`src/lib/profile-service.ts` and `src/lib/user-service.ts` contain business logic. They throw typed errors that API route handlers map to HTTP status codes.

### Error classes

```typescript
class ValidationError extends Error { name = "ValidationError" }
class NotFoundError   extends Error { name = "NotFoundError"   }
class ForbiddenError  extends Error { name = "ForbiddenError"  }
```

These shared error classes live in `src/lib/errors.ts` and are re-exported by the service modules.

### `saveProfile(id, body, ownerId, ownerName)`

1. Validates `id` is a valid UUID (throws `ValidationError` if not).
2. Parses `body` against the Zod `profileSchema` (throws `ValidationError` with the first Zod issue message on failure).
3. Loads the existing profile from the data store.
4. If an existing profile exists and its owner does not match `ownerId`, throws `ForbiddenError`.
5. Sets `profile.owner = { id: ownerId, name: ownerName }`.
6. Calls `upsertProfile(id, profile)` and returns whether the save created a new document.

### `deleteProfileById(id, ownerId)`

1. Validates UUID.
2. Loads existing profile; throws `NotFoundError` if missing.
3. Checks ownership; throws `ForbiddenError` if mismatch.
4. Calls `deleteProfile(id)`.

---

## API Routes

### `GET /api/profiles`

**File:** `src/app/api/profiles/route.ts`

Accepts query parameters: `type`, `engines`, `search`, `owner`, `drafts`, `page`, `limit`.

Owner-filtered results are only served to the authenticated owner. If an unauthenticated caller or a different user specifies `owner`, the `owner` and `drafts` params are silently ignored and the public view is returned.

**Response:** `{ profiles: ProfileSummary[], total: number, page: number, limit: number }`

### `GET /api/profiles/[id]`

**File:** `src/app/api/profiles/[id]/route.ts`

Returns the full profile object. Throws `NotFoundError` (404) for unknown IDs; `ValidationError` (400) for non-UUID IDs.

Draft visibility is enforced server-side: published profiles are visible to everyone, but unpublished drafts are returned only to their owner. Non-owners receive `404` so the endpoint does not disclose whether a draft exists.

### `POST /api/profiles/[id]`

**File:** `src/app/api/profiles/[id]/route.ts`

Requires authentication (401 if no session). Parses the request body as JSON (400 if malformed) and delegates to `saveProfile()`. The route handler maps service errors to HTTP status codes:

```
ValidationError -> 400
NotFoundError   -> 404
ForbiddenError  -> 403
(unexpected)    -> 500
```

Returns HTTP 201 with `{ success: true }` when the save inserts a new profile, and HTTP 200 with the same body when it updates an existing profile.

### `DELETE /api/profiles/[id]`

**File:** `src/app/api/profiles/[id]/route.ts`

Requires authentication. Delegates to `deleteProfileById()` with the same error mapping.

Returns HTTP 204 with no response body on success.

### `POST /api/auth/[...nextauth]`

**File:** `src/app/api/auth/[...nextauth]/route.ts`

Delegates to NextAuth's internal POST handler, but only after applying a per-IP rate limit of 10 requests per 15 minutes. Throttled requests return HTTP 429 with `Retry-After: 900`.

### `POST /api/auth/register`

**File:** `src/app/api/auth/register/route.ts`

Rate-limited: 5 requests per 15 minutes per IP.

Validates:
- Email format (via `email-validator.ts`)
- Password length (minimum 8 characters, maximum 1024)
- Password not in common-passwords list

Hashes password with Argon2 and calls `createUser()`. Returns `{ message, ownerId }`.

### `POST /api/auth/forgot-password`

**File:** `src/app/api/auth/forgot-password/route.ts`

Rate-limited: 5 requests per 15 minutes per IP.

Zero-disclosure: always returns `200 { message: "..." }` regardless of whether the email exists. When throttled, still returns 200 but includes a `Retry-After` header.

If the email exists, creates a reset code and sends an email with a reset link.

### `POST /api/auth/reset-password`

**File:** `src/app/api/auth/reset-password/route.ts`

Rate-limited: 10 requests per 15 minutes per IP.

Accepts `{ token, email, password }` (and still accepts legacy `{ code, email, password }`). Verifies the token (returns 400 if invalid/expired), enforces the same 8–1024 password policy as registration, and updates the password hash in the `users` collection.

### `GET /api/auth/convert/check`

**File:** `src/app/api/auth/convert/check/route.ts`

Accepts a raw token in the query string (`?token=...`). Returns HTTP 200 `{ valid: true }` for a valid, unused, non-expired token, HTTP 404 otherwise. Rate-limited: 20 requests per 15 minutes per IP.

### `POST /api/auth/convert/request`

**File:** `src/app/api/auth/convert/request/route.ts`

Zero-disclosure. Creates a conversion token and sends an email with a conversion link valid for 24 hours. Rate-limited: 5 requests per 15 minutes per IP; when throttled it still returns HTTP 200 with the normal zero-disclosure body and `Retry-After: 900`.

### `POST /api/auth/convert/complete`

**File:** `src/app/api/auth/convert/complete/route.ts`

Rate-limited: 10 requests per 15 minutes per IP.

Accepts `{ token, email, name, password }`. Enforces the same 8–1024 password policy as registration, then completes the conversion in a MongoDB transaction:

1. Retrieve and validate the conversion token.
2. Hash the new password.
3. `createUserIdempotent()` — creates the user record (or retrieves an existing one if the operation is being retried).
4. `updateProfileOwner()` — migrates all profiles to the new owner ID.
5. `markConversionTokenUsed()` — marks the token as consumed.

Returns `{ message, profilesMigrated }`.

---

## Authentication Implementation

`src/lib/auth.ts` configures NextAuth.js with a single Credentials provider.

```typescript
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // 1. findUserByEmail
        // 2. verifyPassword (Argon2)
        // 3. return { id: ownerId, email, name } or null
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.ownerId = user.id;  // user.id is the ownerId
      return token;
    },
    session({ session, token }) {
      if (typeof token.ownerId === "string") session.ownerId = token.ownerId;
      return session;
    },
  },
  pages: { signIn: "/auth/signin" },
});
```

**`handlers`** is mounted at `src/app/api/auth/[...nextauth]/route.ts` to handle NextAuth's internal endpoints (sign-in, sign-out, session). The route wrapper rate-limits POST requests before delegating to NextAuth.

**`auth()`** is a server-side function that reads the JWT from the incoming request and returns the session, or `null` if unauthenticated. Used in API routes and Server Components.

### Password hashing

`src/lib/password.ts` wraps the `argon2` library:

```typescript
export async function hashPassword(password: string): Promise<string>
export async function verifyPassword(hash: string, password: string): Promise<boolean>
```

Argon2id is used by default. The hash includes the algorithm, salt, and parameters — no separate salt storage is needed.

---

## Rate Limiting

`src/lib/rate-limit.ts` implements an in-memory sliding-window rate limiter.

```typescript
function rateLimit(key: string, limit: number, windowMs: number): { success: boolean, remaining: number }
```

Each `key` (typically a client IP) maintains a list of request timestamps. On each call:
1. Prune timestamps older than `windowMs`.
2. If `timestamps.length >= limit`, return `{ success: false, remaining: 0 }`.
3. Otherwise push the current timestamp and return `{ success: true, remaining }`.

Stale keys (no recent requests) are purged every 5 minutes to prevent unbounded memory growth.

### IP extraction

```typescript
function getClientIp(request: Request): string
```

Returns `"unknown"` unless `TRUST_PROXY=true` is set. When trusted, reads `X-Forwarded-For` first, then `X-Real-IP`. When `"unknown"` is returned, all unauthenticated requests share one rate-limit bucket — a safe but blunt fallback suitable for single-server deployments where the app is not behind a proxy.

**Security note:** Set `TRUST_PROXY=true` only when a trusted proxy (Nginx, Cloudflare, etc.) unconditionally overwrites `X-Forwarded-For` before the request reaches Node.js. If set on a server directly exposed to the internet, an attacker can spoof arbitrary IP addresses and bypass per-IP rate limits.

### Usage in API routes

```typescript
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const ip = getClientIp(request);
const { success, remaining } = rateLimit(ip, 5, 15 * 60 * 1000);
if (!success) {
  return NextResponse.json(
    { message: "Too many requests." },
    { status: 429, headers: { "Retry-After": "900" } }
  );
}
```

---

## Email Service

The email subsystem is abstracted behind an interface:

```typescript
interface EmailService {
  sendEmail(to: string, subject: string, htmlBody: string): Promise<void>;
}
```

`getEmailService()` in `src/lib/email/index.ts` is a singleton factory:

```typescript
const provider = process.env.EMAIL_PROVIDER ?? "fake";
return provider === "smtp" ? new SmtpEmailService() : new FakeEmailService();
```

### `SmtpEmailService`

Uses Nodemailer with SMTP transport. Configuration is read from:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Throws if any required variable is missing.

### `FakeEmailService`

Writes emails to `email/{timestamp}-{to}.html` in the project root. Useful during development when no SMTP server is available. No configuration required.

---

## Token Management

`src/lib/token-store.ts` manages two types of short-lived tokens: password reset codes and account conversion tokens.

### Security model

Tokens are never stored in plaintext. The flow is:

```
1. Generate 32 random bytes -> hex string (raw token)
2. Compute SHA-256(raw token) -> store hash in DB
3. Send raw token in email link
4. On redemption: compute SHA-256(submitted token), query by hash
5. On match: mark as used
```

This means even if the database is compromised, raw tokens cannot be extracted.

### Reset code lifecycle

```
createResetCode(email)   -> inserts record, returns raw token (15-min expiry)
verifyResetCode(email, code)
  -> findOneAndUpdate: match hash + not expired + not used, set used=true
  -> returns true if found
```

### Conversion token lifecycle

```
createConversionToken(email) -> inserts record, returns raw token (24-hr expiry)
getConversionToken(token)    -> finds non-expired, unused record by hash
findConversionToken(token)   -> finds non-expired record regardless of used flag
markConversionTokenUsed(token, session?)
  -> updateOne: used=false -> used=true
  -> returns true if this call flipped the flag (false if already used)
```

TTL indexes on `expiresAt` cause MongoDB to automatically delete expired documents. The `expireAfterSeconds: 0` setting means the document is deleted at the exact `expiresAt` time.

---

## Middleware

`src/proxy.ts` runs at the Edge runtime (before every request, excluding static assets).

### CSP nonce generation

```typescript
const bytes = crypto.getRandomValues(new Uint8Array(16));
const nonce = btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join(""));
```

The nonce is injected into:
- `x-nonce` request header (so Server Components can read it via `headers()`)
- `content-security-policy` request header (so Next.js reads it for its internal scripts)
- `Content-Security-Policy` response header (sent to the browser)

CSP policy:

```
default-src 'self';
script-src 'self' 'nonce-{nonce}' 'strict-dynamic';
style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
font-src 'self' https://cdn.jsdelivr.net;
img-src 'self' data:;
connect-src 'self';
frame-ancestors 'none'
```

`'unsafe-inline'` is allowed for styles (Bootstrap requires it). It is explicitly blocked for scripts by using nonce + `'strict-dynamic'` instead.

### CSRF protection

For `POST`, `PUT`, `DELETE`, `PATCH` requests to `/api/*`:

```typescript
const origin = request.headers.get("origin");
const expectedOrigin = request.nextUrl.origin;
if (!origin || origin !== expectedOrigin) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

This prevents cross-origin form submissions and cross-site fetch attacks.

### Matcher configuration

```typescript
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
```

---

## Profile Utilities

`src/lib/profile-utils.ts` provides helpers for working with profile objects.

### `createDefaultProfile()`

Returns a `NewProfile` (id: null) with sensible defaults for all fields. All gauge ranges are initialised with `colour: RangeColour.None`, `min: 0`, `max: 0`, and stable UUIDs. Called when creating a new profile from the UI.

### `createDefaultGauge(name, min, max, options)`

Creates a `Gauge` with 4 empty `GaugeRange` entries. Each range gets a new UUID. Gauge-specific options (`fuelInGallons`, `torqueInFootPounds`, `allowDecimals`, etc.) are passed via the `options` parameter.

### `fixUpGauges(profile)`

Called on every profile read from the database. Ensures backward compatibility with profiles created before certain features were added:

- Sets `allowDecimals: true` on `manifoldPressure`, `fuelFlow`, and `oilPressure` gauges and their ranges (older profiles may have this as `false`).
- Backfills UUIDs on gauge ranges that don't have one (profiles imported before range IDs were introduced).

### `getAircraftTypeImage(type)` / `getAircraftTypeName(type)`

Utility functions that return the image path and display name for an `AircraftType` enum value.

---

## Field Mapping

`src/lib/field-mapping.ts` provides recursive case-conversion utilities.

```typescript
function toCamelCase<T>(obj: Record<string, unknown>): T
function toPascalCase<T>(obj: Record<string, unknown>): T
```

Both functions deep-clone the input object and convert all object keys (not values). They handle nested objects and arrays recursively. The lowercase `id` field is intentionally not converted by the data store (the `id` key is always explicitly re-set after conversion).

This is necessary because MongoDB stores profiles in PascalCase (matching the Simionic app's format), while the application's TypeScript types use camelCase.

---

## Zod Validation Schema

`src/lib/profile-schema.ts` defines the complete Zod validation schema for a profile payload.

Key validation rules:

| Field                | Rule                                               |
|----------------------|----------------------------------------------------|
| `name`               | min 1 char, max 200 chars                          |
| `aircraftType`       | literal 0, 1, or 2                                |
| `engines`            | literal 1 or 2                                    |
| `notes`              | nullable, max 2000 chars                           |
| `cylinders`          | literal 0, 4, or 6; piston profiles may not use 0 |
| `gauge.ranges`       | array of exactly 4 entries                         |
| `gauge.name`         | max 200 chars                                      |
| `gauge.ranges[].colour` | integer 0-3                                     |
| `flapsRange.markings` | array of exactly 6 nullable strings              |
| `flapsRange.positions` | array of exactly 6 nullable numbers             |

All schemas use `.strip()` to ignore unknown fields, so extra properties from older profile versions or the Simionic app are silently dropped on save.

---

## Startup Initialization

`src/instrumentation.ts` is a Next.js instrumentation hook called once at server startup (Node.js runtime only):

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getAppUrlWarning } = await import("./lib/app-url");
    const { initializeDb } = await import("./lib/init");

    const appUrlWarning = getAppUrlWarning();
    if (appUrlWarning) {
      console.warn(appUrlWarning);
    }

    await initializeDb();
  }
}
```

`src/lib/init.ts` calls:
- `initUserStore()` — creates indexes on the `users` collection
- `initTokenStore()` — creates TTL indexes on `password_reset_codes` and `conversion_tokens`
- `initProfileStore()` — creates indexes on the `profiles` collection

This ensures all required indexes exist before the first request is served, rather than lazily on the first operation. The dynamic import inside the condition avoids loading server-only code in Edge runtime contexts.

---

## React Components

### `AuthProvider` (`src/components/AuthProvider.tsx`)

A thin Client Component wrapper around NextAuth's `SessionProvider`. Placed in `layout.tsx` so that all pages and components can access the session via `useSession()`.

### `Navbar` (`src/components/Navbar.tsx`)

Client Component. Reads the session with `useSession()` to show/hide sign-in and sign-out links and display the authenticated user's name.

### `ProfileEditor` (`src/components/ProfileEditor.tsx`)

The largest Client Component in the application. Manages the full profile editing form state. Responsibilities:

- Maintains all profile fields in React state.
- Shows/hides gauge panels based on `aircraftType` (piston-only, turboprop-only, etc.).
- Validates the form client-side before submission.
- Calls `POST /api/profiles/[id]` to save changes.
- Calls `DELETE /api/profiles/[id]` for profile deletion.
- Triggers client-side JSON export via `src/lib/export.ts`.

### `GaugeDisplay` (`src/components/GaugeDisplay.tsx`)

Client Component used inside `ProfileEditor`. Renders a visual representation of a gauge's colour bands and provides an editing UI for each of the 4 ranges. Notifies the parent via a callback when ranges change.

### `ProfileCard` (`src/components/ProfileCard.tsx`)

Renders a summary card for a profile in the browse list. Displays aircraft type, engine count, author, and last-updated date. Links to the profile view page.

### `ProfileFilters` (`src/components/ProfileFilters.tsx`)

Client Component that renders the search/filter controls (aircraft type select, engine count select, free-text search). Updates URL query parameters when filters change, causing the page to re-fetch.

### `ProfileCardSkeleton` (`src/components/ProfileCardSkeleton.tsx`)

A loading placeholder that matches the visual dimensions of `ProfileCard`. Used during profile list loading to prevent layout shift.

### `Notice` (`src/components/Notice.tsx`)

A simple alert/notification component wrapping a Bootstrap alert. Used across auth pages and the editor to display success/error messages.

---

## Migration Script

`scripts/migrate-to-mongo.ts` is a standalone TypeScript script run with `tsx`:

```bash
npm run migrate
# equivalent to: npx tsx scripts/migrate-to-mongo.ts
```

Behaviour:

1. Reads all `.json` files from the `data/` directory.
2. For each file, reads and parses the JSON.
3. Ensures a unique index on `id` in the `profiles` collection.
4. Calls `updateOne({ id }, { $set: doc }, { upsert: true })` for each profile.
5. Reports counts of imported, skipped (already exists + unchanged), and errored files.

This script is idempotent — it can be run multiple times without duplicating data.

---

## Testing

The project has automated unit, integration, and UI tests.

### Unit tests

Run pure-library tests with the Node.js test runner:

```bash
npm run test:unit
```

These cover modules under `src/lib/`, including the rate limiter, field mapping, services, token store, password-policy helpers, and profile utilities.

### Integration tests

Run route and proxy tests with mocked I/O:

```bash
npm run test:integration
```

These cover API routes under `src/app/api/**` and `src/proxy.ts` without requiring a live MongoDB instance.

### UI tests

Run the Playwright browser tests:

```bash
npm run test:ui
```

Open the HTML report from the last run with:

```bash
npm run test:ui:report
```

### All non-UI tests

```bash
npm test
```

The repository standardises on Node's built-in `node:test` module and `assert/strict` for unit and integration tests, plus Playwright for browser coverage.
