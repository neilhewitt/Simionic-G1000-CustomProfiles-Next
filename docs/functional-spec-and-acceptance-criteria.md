# Functional Specification & Acceptance Criteria

> This document describes how each part of the Simionic G1000 Custom Profiles
> application should function. It also contains a complete set of acceptance
> criteria written from the perspective of building the product from scratch.
> It is intended to serve as the authoritative basis for a test suite (unit,
> integration and UI/end-to-end tests).

---

## Table of Contents

1. [Domain & Purpose](#1-domain--purpose)
2. [Technology Stack](#2-technology-stack)
3. [Data Models](#3-data-models)
4. [Site Structure & Navigation](#4-site-structure--navigation)
5. [Authentication & User Management](#5-authentication--user-management)
6. [Profile Management](#6-profile-management)
7. [API Layer](#7-api-layer)
8. [Security & Middleware](#8-security--middleware)
9. [Rate Limiting](#9-rate-limiting)
10. [Email Service](#10-email-service)
11. [Acceptance Criteria](#11-acceptance-criteria)

---

## 1. Domain & Purpose

The application is a community repository of custom instrument-panel configuration
profiles for the **Simionic G1000** iPad/tablet flight simulator app. Pilots flying
in the simulator can fine-tune how every gauge (RPM, fuel, oil pressure, CHT, EGT,
etc.) looks and behaves. Rather than every user configuring gauges from scratch,
they can share those configurations here and import them into the simulator app via
a JSON file.

Key domain concepts:

| Concept | Meaning |
|---------|---------|
| **Profile** | A complete set of instrument panel settings for one aircraft type |
| **Gauge** | A single instrument (e.g. RPM, Fuel, Oil Temp) with its range and colour bands |
| **Range** | A coloured band on a gauge (None, Green, Yellow, Red) with min/max values |
| **V-speeds** | Characteristic airspeeds (Vs0, Vs1, Vfe, Vno, Vne, Vglide, Vr, Vx, Vy) |
| **Aircraft Type** | Piston (0), Turboprop (1), Jet (2) |
| **Owner** | A registered user who created and "owns" a profile |
| **Published** | A profile visible to all users; unpublished profiles visible only to their owner |
| **Owner ID** | A UUID identifying ownership; used instead of email to decouple identity |

---

## 2. Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router), React |
| Language | TypeScript (strict mode) |
| Database | MongoDB (documents stored in PascalCase, returned in camelCase) |
| Auth | NextAuth.js (Credentials provider – email + password) |
| Password hashing | Argon2 |
| Validation | Zod |
| Email | Nodemailer (SMTP) or fake/logger service |
| Styling | Bootstrap 5 |
| Tests | Node.js built-in test runner (`node:test`) |

---

## 3. Data Models

### 3.1 Profile

A `Profile` document represents a complete G1000 instrument configuration. It exists
in two states: `NewProfile` (id = null, not yet saved) and `SavedProfile` (id = UUID).

```
Profile {
  id:                        string | null   // UUID; null for unsaved
  owner:                     OwnerInfo       // { id: string|null, name: string|null }
  lastUpdated:               string          // ISO 8601 timestamp (set by server)
  name:                      string          // 1–200 chars; required
  aircraftType:              0|1|2           // Piston|Turboprop|Jet
  engines:                   1|2
  isPublished:               boolean
  notes:                     string|null     // 0–2000 chars

  // Piston-only (present on all profiles but only used for Piston;
  // imported non-piston profiles may carry 0 here)
  cylinders:                 0|4|6
  fadec:                     boolean
  turbocharged:              boolean
  constantSpeed:             boolean
  vacuumPSIRange:            VacuumPSIRange  // { min, max, greenStart, greenEnd }
  manifoldPressure:          Gauge
  cht:                       Gauge           // Cylinder Head Temperature
  egt:                       Gauge           // Exhaust Gas Temperature
  tit:                       Gauge           // Turbine Inlet Temperature
  load:                      Gauge           // Engine load %

  // Turboprop-only
  torque:                    Gauge
  ng:                        Gauge           // Gas generator speed %

  // Turboprop + Jet
  itt:                       Gauge           // Interstage Turbine Temperature

  // Common to all aircraft types
  temperaturesInFahrenheit:  boolean
  rpm:                       Gauge
  fuel:                      Gauge
  fuelFlow:                  Gauge
  oilPressure:               Gauge
  oilTemperature:            Gauge

  displayElevatorTrim:       boolean
  elevatorTrimTakeOffRange:  SettingRange    // { min, max }
  displayRudderTrim:         boolean
  rudderTrimTakeOffRange:    SettingRange
  displayFlapsIndicator:     boolean
  flapsRange:                FlapsRange      // { markings: [6], positions: [6] }
  vSpeeds:                   VSpeeds         // Vs0, Vs1, Vfe, Vno, Vne, Vglide, Vr, Vx, Vy
}
```

### 3.2 Gauge

Each `Gauge` has exactly **4 range slots** (indices 0–3). Unused slots have
`colour = 0` (None) and `min = max = 0`.

```
Gauge {
  name:                  string
  min:                   number | null
  max:                   number | null
  fuelInGallons:         boolean | null    // fuel gauge only
  capacityForSingleTank: number | null     // fuel gauge only
  torqueInFootPounds:    boolean | null    // torque gauge only
  maxPower:              number | null     // torque gauge only
  ranges:                GaugeRange[4]
  allowDecimals:         boolean
}

GaugeRange {
  id:            string          // UUID (backfilled by fixUpGauges if missing)
  colour:        0|1|2|3        // None|Green|Yellow|Red
  min:           number
  max:           number
  allowDecimals: boolean
}
```

Specific gauges have `allowDecimals` force-set to `true` by `fixUpGauges()`:
manifoldPressure, fuelFlow, oilPressure (and their individual range slots).

### 3.3 ProfileSummary

A lightweight projection returned by the list API (excludes gauge details):

```
ProfileSummary {
  id, owner, lastUpdated, name, aircraftType, engines, isPublished, notes
}
```

### 3.4 User

Stored in MongoDB `users` collection. Never exposed directly via API.

```
User {
  email:        string     // lowercase + trimmed; unique index
  name:         string
  passwordHash: string     // Argon2 hash
  ownerId:      string     // UUID; unique index
  createdAt:    Date
}
```

### 3.5 Reset & Conversion Tokens

**Reset tokens** (collection `reset_codes`):

```
ResetCode {
  email:      string
  codeHash:   string     // SHA-256 of the plaintext token
  expiresAt:  Date       // now + 15 minutes
  used:       boolean
}
```

**Conversion tokens** (collection `conversion_tokens`):

```
ConversionToken {
  email:     string
  token:     string      // plaintext UUID (not hashed; direct lookup)
  expiresAt: Date        // now + 24 hours
  used:      boolean
}
```

---

## 4. Site Structure & Navigation

### 4.1 Pages

| Path | Auth Required | Purpose |
|------|--------------|---------|
| `/` | No | Home page with hero banner and quick-action links |
| `/profiles` | No | Browse/search published profiles |
| `/profile/[id]` | No (auth optional) | View a profile; edit mode for owners |
| `/create` | Yes | Create a new profile from defaults |
| `/edit/[id]` | Yes | Redirect to `/profile/[id]?edit=true` |
| `/import` | Yes | Upload a JSON file to create a profile |
| `/downloads` | No | Links to the Simionic G1000 app |
| `/auth/signin` | No | Sign-in form |
| `/auth/register` | No | Registration form |
| `/auth/forgot-password` | No | Request password reset link |
| `/auth/reset-password` | No | Set new password via token link |
| `/auth/convert` | No | Request Microsoft→local account conversion |
| `/auth/convert/[token]` | No | Complete account conversion |
| `/about`, `/faq`, `/terms`, `/privacy`, `/contact` | No | Static informational pages |

### 4.2 Navigation Bar

- Always visible at the top of every page.
- Shows the application name/logo (links to `/`).
- When **unauthenticated**: shows links to Browse, Sign In, Register.
- When **authenticated**: shows Browse, Create, Import, and a user menu (with the user's name, link to their profiles, and Sign Out).
- The "Create" link navigates to `/create`.
- The "Import" link navigates to `/import`.
- Sign Out ends the session and redirects to the home page.

### 4.3 Home Page (`/`)

- Displays a hero banner section introducing the site.
- Provides quick-access buttons/links to: Browse Profiles, Create Profile (auth gated), Import Profile (auth gated).
- No authentication required to view.

### 4.4 Browse Profiles (`/profiles`)

- Displays a paginated list of **published** profiles.
- Filter controls:
  - Aircraft type (All / Piston / Turboprop / Jet)
  - Engine count (All / Single / Twin)
  - Text search (searches profile name and author name simultaneously; supports multiple space/comma-separated terms each applied as AND conditions)
- Pagination with configurable page size (default 20, max 100).
- Each profile card shows: name, author name, aircraft type image, aircraft type label, engine count, last updated date, a notes snippet, and action buttons.
- Profile list is sorted by `lastUpdated` descending (most recently updated first).
- Skeleton loading placeholders shown while data is fetching.

### 4.5 Profile View & Edit (`/profile/[id]`)

- **View mode** (default, no auth needed): displays all profile fields in a read-only layout.
  - Shows: name, author, aircraft type, engines, last updated, notes, V-speeds, trim/flaps settings, and all applicable gauge configurations.
  - Displays gauge ranges with colour indicators.
  - "Export as JSON" button downloads the profile as a `.json` file.
  - If the viewer is the owner, shows "Edit" and "Delete" buttons.
- **Edit mode** (`?edit=true`, owner only): shows the `ProfileEditor` component.
  - All fields editable.
  - "Save" button POSTs changes to `/api/profiles/[id]`.
  - "Cancel" reverts to view mode without saving.
  - "Publish / Unpublish" toggle changes `isPublished`.
  - "Delete" button removes the profile (with confirmation).
  - Non-owners accessing edit mode are redirected to view mode.

### 4.6 Create Profile (`/create`)

- Requires authentication; redirects unauthenticated users to sign-in.
- Initialises the `ProfileEditor` with a blank `createDefaultProfile()`.
- On save, POSTs to `/api/profiles/[generated-uuid]`.
- On success, redirects to `/profile/[new-id]`.

### 4.7 Import Profile (`/import`)

- Requires authentication.
- Provides a file-upload input accepting `.json` files.
- Parses the uploaded JSON and validates it against `profileSchema`.
- On valid upload, allows the user to review and then save.
- On save, POSTs to `/api/profiles/[generated-uuid]` with the imported data.
- Sets `owner` to the current user and `lastUpdated` to now.

---

## 5. Authentication & User Management

### 5.1 Registration

- Form collects: name, email, password.
- Client-side and server-side validation:
  - Name: required, non-empty after trim.
  - Email: must be a valid email address.
  - Password: minimum 8 characters; must not be in the common passwords list.
- Passwords are hashed with **Argon2** before storage.
- User creation is **idempotent** (handles concurrent race conditions safely).
- If the email already exists, returns HTTP 409 with a descriptive message.
- On success, returns HTTP 201 with `{ message, ownerId }`.
- Rate limited: 5 requests per 15 minutes per IP.

### 5.2 Sign In

- Uses NextAuth Credentials provider.
- Accepts email + password.
- Email is normalised (lowercase + trim) before lookup.
- Password verified using Argon2.
- On success, creates a **JWT session** containing `ownerId` and user name.
- Wrong credentials return a generic error (no disclosure of whether email exists).
- Session is passed via cookies; `useSession()` / `auth()` accessible from
  client and server components respectively.

### 5.3 Sign Out

- Clears the session cookie.
- Redirects to the home page.

### 5.4 Password Reset

Two-step flow:

**Step 1 – Request** (`POST /api/auth/forgot-password`):
- Accepts `{ email }`.
- Looks up the user; if not found, returns success anyway (**zero-disclosure**).
- If found, generates a random token, stores its SHA-256 hash in `reset_codes`,
  and sends an email with the reset link (`/auth/reset-password?token=…&email=…`).
- Token expires in **15 minutes**.
- Returns HTTP 200 with a generic message regardless of outcome.
- If rate-limited, still returns HTTP 200 but adds a `Retry-After: 900` header.

**Step 2 – Reset** (`POST /api/auth/reset-password`):
- Accepts `{ email, token, password }`.
- Validates the token hash against the stored hash (checking expiry and `used` flag).
- Validates the new password (≥8 chars, not common).
- Marks the token as used.
- Updates the user's Argon2 password hash.
- Returns HTTP 200 on success.
- Returns HTTP 400 for invalid/expired token or weak password.
- Rate limited: 10 requests per 15 minutes per IP.

### 5.5 Account Conversion (Microsoft → Local)

Allows users who previously authenticated via Microsoft OAuth to create a local
account while retaining all their existing profiles.

**Step 1 – Request** (`POST /api/auth/convert/request`):
- Accepts `{ email }`.
- If a local account already exists for the email, returns success with no action
  (**zero-disclosure**).
- If no local account exists, generates a conversion token (UUID), stores it in
  `conversion_tokens`, and sends an email with the conversion link
  (`/auth/convert/[token]`).
- Token expires in **24 hours**.
- Returns HTTP 200 with a generic message regardless of outcome.

**Step 2 – Check** (`GET /api/auth/convert/check?token=…`):
- Returns HTTP 200 `{ valid: true }` if the token is found, unexpired, and unused.
- Returns HTTP 404 if the token is invalid, expired, or already used.

**Step 3 – Complete** (`POST /api/auth/convert/complete`):
- Accepts `{ token, email, name, password }`.
- Validates the token matches the email.
- If the token was already used and a matching user exists, returns success
  (idempotent retry).
- Otherwise:
  1. Creates the new local user (idempotent).
  2. Updates all profiles where their stored `owner.id` equals the old
     Microsoft-derived owner ID to point to the new local owner ID —
     **atomically** in a MongoDB transaction (the field is `Owner.Id` in
     the raw MongoDB document; `owner.id` in the camelCase API representation).
  3. Marks the conversion token as used.
- Returns `{ message, profilesMigrated }`.
- Returns HTTP 400 for invalid/expired token or validation errors.
- Returns HTTP 409 for inconsistent state (token used but user missing).
- Rate limited: 10 requests per 15 minutes per IP.

**Old Owner ID derivation**: The "Microsoft owner ID" is derived from the email
address via `getOwnerId(email)` (defined in `src/lib/owner-id.ts`), which returns
a deterministic UUID based on the email. This was the mechanism used by the legacy
Microsoft-auth system to associate profiles with a user identity.

---

## 6. Profile Management

### 6.1 Creating a Profile

- Requires authentication.
- User navigates to `/create` or uses the import flow.
- A new profile UUID is generated on the client.
- Sent to `POST /api/profiles/[id]`.
- Server validates with Zod `profileSchema`.
- Server sets `owner` to `{ id: ownerId, name: ownerName }` from the session.
- Server sets `lastUpdated` to the current ISO timestamp.
- Profile stored in MongoDB `profiles` collection.
- Fields stored in **PascalCase** in MongoDB; returned in **camelCase** via API.

### 6.2 Reading a Profile

- `GET /api/profiles/[id]`: returns the full profile.
- `fixUpGauges()` is applied on read:
  - Forces `manifoldPressure`, `fuelFlow`, `oilPressure` and their ranges to
    have `allowDecimals = true`.
  - Backfills missing `id` fields on gauge ranges with new UUIDs.
- Profiles with `isPublished = false` are still accessible via direct URL
  (there is no access restriction on the read endpoint itself).

### 6.3 Updating a Profile

- `POST /api/profiles/[id]` (upsert semantics).
- Requires valid session (HTTP 401 if missing).
- Body validated with Zod; HTTP 400 with first validation error on failure.
- Checks ownership: if a profile with this ID already exists and its owner differs
  from the session user, returns HTTP 403.
- On success, sets `owner` from session and `lastUpdated` to now; upserts the document.

### 6.4 Deleting a Profile

- `DELETE /api/profiles/[id]`.
- Requires valid session (HTTP 401 if missing).
- Profile must exist (HTTP 404 if not).
- Session user must be the owner (HTTP 403 if not).
- Returns HTTP 200 `{ success: true }` on success.

### 6.5 Listing/Searching Profiles

`GET /api/profiles` supports the following query parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | 0\|1\|2 | Filter by aircraft type |
| `engines` | 1\|2 | Filter by engine count |
| `search` | string | Free-text search (profile name + author name) |
| `owner` | string | Filter by owner ID |
| `drafts` | boolean | When `true` + `owner` set: show only unpublished profiles |
| `page` | number | Page number (default 1, min 1) |
| `limit` | number | Page size (default 20, min 1, max 100) |

- Without an `owner` filter: only **published** profiles are returned.
- With an `owner` filter but no session (or different user): still only published.
- With `owner` matching the authenticated user and `drafts=true`: only their
  unpublished profiles.
- Multi-term search: each space/comma-separated term creates an additional AND
  condition matching the profile name OR author name (case-insensitive regex).
- Results sorted by `lastUpdated` descending.
- Returns `{ profiles: ProfileSummary[], total, page, limit }`.

### 6.6 Default Profile Shape

`createDefaultProfile()` produces a valid Profile with:
- `id = null`, no owner set, `isPublished = false`.
- `aircraftType = Piston`, `engines = 1`, `cylinders = 4`.
- All gauges initialised with `min = 0`, `max = 0`, 4 blank ranges (colour=None).
- Special defaults:
  - `manifoldPressure`, `oilPressure`, `fuelFlow`: `allowDecimals = true`.
  - `fuel`: `fuelInGallons = true`, `capacityForSingleTank = 0`.
  - `torque`: `torqueInFootPounds = true`.
  - `flapsRange`: first marking = "UP" at position 0; last marking = "F" at position 100.
  - All V-speeds = 0.

### 6.7 JSON Export

- Client-side only (`export.ts`).
- Downloads the current profile as a prettily-formatted JSON file.
- Filename: `<profile-name>.json` (sanitised).
- This file is the same format importable into the Simionic G1000 app.

### 6.8 JSON Import

- Accepts a JSON file from the user.
- The JSON is parsed and validated against `profileSchema`.
- If valid, prefills the `ProfileEditor` with the imported data.
- The owner and `lastUpdated` are reset; the profile is treated as a new draft.

---

## 7. API Layer

### 7.1 General Conventions

- All endpoints return JSON.
- Auth state is read from the NextAuth JWT session cookie (`auth()` server-side).
- Missing auth on a protected endpoint: HTTP 401 `{ error: "Unauthorized" }`.
- CSRF protection: mutating methods (POST/PUT/DELETE/PATCH) require the request's
  `Origin` header to match the server origin (enforced in middleware). NextAuth's
  own endpoints are excluded.
- MongoDB fields are stored in PascalCase and returned via `toCamelCase()` helper.

### 7.2 Error Response Shape

| Scenario | Status | Body |
|----------|--------|------|
| Auth missing | 401 | `{ error: "Unauthorized" }` |
| Auth forbidden | 403 | `{ error: "..." }` |
| Not found | 404 | `{ error: "..." }` |
| Validation error | 400 | `{ error: "..." }` |
| Conflict | 409 | `{ error: "..." }` |
| Rate limited | 429 | `{ error: "Too many requests..." }` |
| Server error | 500 | `{ error: "Internal server error" }` |

### 7.3 Profile API Endpoints

See §6 above for business rules. HTTP interface summary:

| Method | Path | Auth | Success Status |
|--------|------|------|---------------|
| GET | `/api/profiles` | No | 200 |
| GET | `/api/profiles/[id]` | No | 200 |
| POST | `/api/profiles/[id]` | Yes | 200 |
| DELETE | `/api/profiles/[id]` | Yes | 200 |

### 7.4 Auth API Endpoints

| Method | Path | Auth | Success Status |
|--------|------|------|---------------|
| POST | `/api/auth/register` | No | 201 |
| POST | `/api/auth/forgot-password` | No | 200 (always) |
| POST | `/api/auth/reset-password` | No | 200 |
| POST | `/api/auth/convert/request` | No | 200 (always) |
| GET | `/api/auth/convert/check` | No | 200 or 404 |
| POST | `/api/auth/convert/complete` | No | 200 |

---

## 8. Security & Middleware

### 8.1 CSRF Protection

Implemented in `src/middleware.ts`:

- For every **mutating** API request (POST, PUT, DELETE, PATCH), the middleware
  checks that the `Origin` header matches the server's own origin.
- Requests without a matching Origin are rejected with HTTP 403.
- NextAuth-owned paths (`/api/auth/[...nextauth]`) are **excluded** from CSRF
  checks (NextAuth applies its own CSRF token mechanism).
- Safe methods (GET, HEAD, OPTIONS) are always passed through.

### 8.2 Content Security Policy (CSP)

- A random nonce is generated on every request.
- The CSP header is set with `script-src 'nonce-{value}' 'strict-dynamic'`.
- Allows Bootstrap icon CDN resources (fonts/CSS).
- Nonce is passed via response header and available to Next.js server components.

### 8.3 Other Security Headers

Set by `next.config.ts`:

- `Strict-Transport-Security`: enforces HTTPS.
- `X-Frame-Options: DENY`: prevents clickjacking.
- `X-Content-Type-Options: nosniff`: prevents MIME-type sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy`: disables camera, microphone, geolocation.

### 8.4 Password Policy

- Minimum 8 characters.
- Must not appear in `common-passwords.ts` list.
- Hashed with Argon2 (memory-hard algorithm).

### 8.5 Email Normalisation

All email addresses are lowercased and trimmed before lookup or storage.

### 8.6 Token Security

- Password reset tokens: stored as **SHA-256 hash**, never plaintext.
- Conversion tokens: stored as plaintext UUID (used for direct URL lookup).
- Both token types have an `expiresAt` timestamp and a `used` flag.
- Tokens can only be used once.

---

## 9. Rate Limiting

### 9.1 Implementation

Sliding-window rate limiter (`src/lib/rate-limit.ts`):

- Keyed on the result of `getClientIp(request)`.
- Each key stores a list of request timestamps.
- On each call: prune timestamps older than the window, check count, push new timestamp.
- Stale keys (all timestamps expired) are removed every 5 minutes.
- **When `TRUST_PROXY` is not `"true"`**: all requests use the key `"unknown"`
  (safe default — prevents IP-spoofing bypass but causes global sharing of the
  rate-limit bucket).
- **When `TRUST_PROXY=true`**: reads `x-forwarded-for` (first IP) then `x-real-ip`.

### 9.2 Endpoint Limits

| Endpoint | Limit | Window | Behaviour when exceeded |
|----------|-------|--------|-------------------------|
| `register` | 5 | 15 min | HTTP 429 |
| `forgot-password` | 5 | 15 min | HTTP 200 + `Retry-After: 900` header |
| `reset-password` | 10 | 15 min | HTTP 429 |
| `convert/request` | 5 | 15 min | HTTP 200 (zero-disclosure) |
| `convert/complete` | 10 | 15 min | HTTP 429 |

---

## 10. Email Service

### 10.1 Abstraction

`src/lib/email/index.ts` exports `getEmailService()` which returns either:

- **SMTP service** (when `EMAIL_PROVIDER=smtp`): uses Nodemailer with configured
  SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
- **Fake service** (any other value): logs the email content to the console without
  sending. Used in development.

### 10.2 Sent Emails

| Trigger | Subject | Content |
|---------|---------|---------|
| Password reset request | "Password Reset — Simionic G1000 Profile DB" | Link valid 15 min |
| Account conversion request | "Account Conversion — Simionic G1000 Profile DB" | Link valid 24 hours |

---

## 11. Acceptance Criteria

The following acceptance criteria define the expected behaviour of the system. Each
criterion is self-contained and testable. Criteria are grouped by feature area.

---

### AC-AUTH-01: User Registration — Happy Path

**Given** the registration endpoint receives `{ name: "Alice", email: "alice@example.com", password: "Secure1234!" }`  
**When** no account exists for that email  
**Then** the response status is 201 and the body contains `{ message: string, ownerId: string }` where `ownerId` is a valid UUID.

---

### AC-AUTH-02: Registration — Duplicate Email

**Given** an account already exists for `alice@example.com`  
**When** the same email is submitted for registration  
**Then** the response status is 409 and the body contains `{ error: string }`.

---

### AC-AUTH-03: Registration — Weak Password (too short)

**Given** a registration request with `password: "abc"`  
**When** the request reaches the API  
**Then** the response status is 400 with a validation error.

---

### AC-AUTH-04: Registration — Common Password

**Given** a registration request with `password: "password"`  
**When** the request reaches the API  
**Then** the response status is 400 with a validation error indicating the password is too common.

---

### AC-AUTH-05: Registration — Invalid Email Format

**Given** a registration request with `email: "not-an-email"`  
**When** the request reaches the API  
**Then** the response status is 400 with a validation error.

---

### AC-AUTH-06: Registration — Rate Limited

**Given** 5 registration requests have been made from the same IP within 15 minutes  
**When** a 6th request is made from the same IP  
**Then** the response status is 429.

---

### AC-AUTH-07: Sign In — Valid Credentials

**Given** a registered user with email and password  
**When** they sign in via NextAuth with correct credentials  
**Then** a session JWT is issued containing `ownerId` and user `name`.

---

### AC-AUTH-08: Sign In — Wrong Password

**Given** a registered user  
**When** they sign in with an incorrect password  
**Then** the sign-in attempt fails with a generic error (no disclosure of whether the email exists).

---

### AC-AUTH-09: Password Reset — Request (User Exists)

**Given** a registered user `alice@example.com`  
**When** `POST /api/auth/forgot-password` is called with `{ email: "alice@example.com" }`  
**Then** the response is HTTP 200 with `{ message: "If an account exists, a reset link has been sent." }` and an email is sent containing a reset link.

---

### AC-AUTH-10: Password Reset — Request (User Does Not Exist)

**Given** no user exists for `unknown@example.com`  
**When** `POST /api/auth/forgot-password` is called with `{ email: "unknown@example.com" }`  
**Then** the response is HTTP 200 with the same generic message (zero-disclosure), and no email is sent.

---

### AC-AUTH-11: Password Reset — Request Rate Limited (Zero-Disclosure)

**Given** 5 `forgot-password` requests have been made from the same IP within 15 minutes  
**When** a 6th request is made  
**Then** the response is still HTTP 200 (not 429), but the `Retry-After: 900` header is present and the body contains the same generic message.

---

### AC-AUTH-12: Password Reset — Complete with Valid Token

**Given** a valid, unused, unexpired reset token for `alice@example.com`  
**When** `POST /api/auth/reset-password` is called with `{ email, token, password: "NewSecure99!" }`  
**Then** the response is HTTP 200 and the user can subsequently sign in with the new password.

---

### AC-AUTH-13: Password Reset — Invalid Token

**Given** an invalid or expired token  
**When** `POST /api/auth/reset-password` is called  
**Then** the response is HTTP 400.

---

### AC-AUTH-14: Password Reset — Token Used Twice

**Given** a reset token that has already been used  
**When** the same token is submitted again  
**Then** the response is HTTP 400.

---

### AC-AUTH-15: Account Conversion — Request (Zero-Disclosure)

**Given** a local account already exists for `alice@example.com`  
**When** `POST /api/auth/convert/request` is called with `{ email: "alice@example.com" }`  
**Then** the response is HTTP 200 with `{ message: string }` and no conversion email is sent.

---

### AC-AUTH-16: Account Conversion — Check Valid Token

**Given** a valid, unused, unexpired conversion token `<token>`  
**When** `GET /api/auth/convert/check?token=<token>` is called  
**Then** the response is HTTP 200 with `{ valid: true }`.

---

### AC-AUTH-17: Account Conversion — Check Invalid Token

**Given** an invalid or expired conversion token  
**When** `GET /api/auth/convert/check?token=...` is called  
**Then** the response is HTTP 404.

---

### AC-AUTH-18: Account Conversion — Complete

**Given** a valid unused conversion token for `ms-user@example.com`, and profiles owned by the derived Microsoft owner ID  
**When** `POST /api/auth/convert/complete` is called with valid `{ token, email, name, password }`  
**Then**:
- A new local user is created.
- All profiles from the old Microsoft owner ID are transferred to the new local owner ID atomically.
- The token is marked as used.
- The response is HTTP 200 with `{ message: string, profilesMigrated: number }`.

---

### AC-AUTH-19: Account Conversion — Idempotent Retry

**Given** a conversion token that was already successfully used and the new user exists  
**When** `POST /api/auth/convert/complete` is called again with the same token  
**Then** the response is HTTP 200 `{ message: "Account already converted.", profilesMigrated: 0 }`.

---

### AC-PROFILE-01: Create Profile — Authenticated

**Given** an authenticated user  
**When** `POST /api/profiles/[new-uuid]` is called with a valid profile body  
**Then** the response is HTTP 200 `{ success: true }` and the profile is retrievable via `GET /api/profiles/[id]`.

---

### AC-PROFILE-02: Create Profile — Unauthenticated

**Given** no active session  
**When** `POST /api/profiles/[id]` is called  
**Then** the response is HTTP 401.

---

### AC-PROFILE-03: Create Profile — Invalid UUID

**Given** an authenticated user  
**When** `POST /api/profiles/not-a-uuid` is called  
**Then** the response is HTTP 400 with a validation error.

---

### AC-PROFILE-04: Create Profile — Invalid Body (Missing Required Field)

**Given** an authenticated user  
**When** `POST /api/profiles/[id]` is called with a body where `name` is an empty string  
**Then** the response is HTTP 400 with `{ error: "Profile name is required." }`.

---

### AC-PROFILE-05: Update Profile — Owner Can Update

**Given** an authenticated user who owns profile `[id]`  
**When** `POST /api/profiles/[id]` is called with a valid modified profile  
**Then** the response is HTTP 200 and subsequent `GET /api/profiles/[id]` returns the updated data.

---

### AC-PROFILE-06: Update Profile — Non-Owner Forbidden

**Given** an authenticated user who does NOT own profile `[id]`  
**When** `POST /api/profiles/[id]` is called  
**Then** the response is HTTP 403.

---

### AC-PROFILE-07: Get Profile — Exists

**Given** a published profile with a known ID  
**When** `GET /api/profiles/[id]` is called  
**Then** the response is HTTP 200 with a valid `Profile` object.

---

### AC-PROFILE-08: Get Profile — Not Found

**Given** a UUID that does not correspond to any profile  
**When** `GET /api/profiles/[id]` is called  
**Then** the response is HTTP 404.

---

### AC-PROFILE-09: Get Profile — fixUpGauges Applied

**Given** a profile stored without `allowDecimals = true` on manifoldPressure  
**When** `GET /api/profiles/[id]` returns the profile  
**Then** `manifoldPressure.allowDecimals` is `true` and `manifoldPressure.ranges[*].allowDecimals` are `true`.

---

### AC-PROFILE-10: Get Profile — Missing Range IDs Backfilled

**Given** a profile with gauge ranges that have no `id` field  
**When** `GET /api/profiles/[id]` returns the profile  
**Then** every gauge range has a non-empty `id` field that is a valid UUID.

---

### AC-PROFILE-11: Delete Profile — Owner Can Delete

**Given** an authenticated user who owns profile `[id]`  
**When** `DELETE /api/profiles/[id]` is called  
**Then** the response is HTTP 200 `{ success: true }` and subsequent `GET /api/profiles/[id]` returns HTTP 404.

---

### AC-PROFILE-12: Delete Profile — Non-Owner Forbidden

**Given** an authenticated user who does NOT own profile `[id]`  
**When** `DELETE /api/profiles/[id]` is called  
**Then** the response is HTTP 403.

---

### AC-PROFILE-13: Delete Profile — Not Found

**Given** a UUID with no corresponding profile  
**When** `DELETE /api/profiles/[id]` is called by an authenticated user  
**Then** the response is HTTP 404.

---

### AC-PROFILE-14: List Profiles — Returns Only Published

**Given** two profiles: one published, one unpublished (by a different user)  
**When** `GET /api/profiles` is called without auth  
**Then** only the published profile appears in the results.

---

### AC-PROFILE-15: List Profiles — Owner Sees Own Drafts

**Given** an authenticated user with one published and one unpublished profile  
**When** `GET /api/profiles?owner=[ownerId]` is called (authenticated as that user)  
**Then** both profiles appear in the results.

---

### AC-PROFILE-16: List Profiles — Filter by Aircraft Type

**Given** profiles of types Piston (0), Turboprop (1), Jet (2)  
**When** `GET /api/profiles?type=1` is called  
**Then** only Turboprop profiles are returned.

---

### AC-PROFILE-17: List Profiles — Search by Name

**Given** profiles named "Cessna 172" and "Piper Archer"  
**When** `GET /api/profiles?search=Cessna` is called  
**Then** only the "Cessna 172" profile appears.

---

### AC-PROFILE-18: List Profiles — Search by Author

**Given** a profile authored by "Alice"  
**When** `GET /api/profiles?search=Alice` is called  
**Then** that profile appears.

---

### AC-PROFILE-19: List Profiles — Multi-Term Search (AND logic)

**Given** profiles: "Cessna 172 by Alice", "Piper Archer by Alice"  
**When** `GET /api/profiles?search=Cessna+Alice` is called  
**Then** only "Cessna 172 by Alice" appears (both terms must match name or author).

---

### AC-PROFILE-20: List Profiles — Pagination

**Given** 25 published profiles  
**When** `GET /api/profiles?limit=10&page=2` is called  
**Then** the response contains 10 profiles, `total = 25`, `page = 2`, `limit = 10`.

---

### AC-PROFILE-21: List Profiles — Sorted by lastUpdated Descending

**Given** profiles updated at different times  
**When** `GET /api/profiles` is called  
**Then** the most recently updated profile appears first.

---

### AC-RATE-01: Sliding Window — Allows Requests Within Limit

**Given** a limit of 2 requests per 1000 ms  
**When** 2 requests are made within the window  
**Then** both return `{ success: true }` with decreasing `remaining` values.

---

### AC-RATE-02: Sliding Window — Blocks Requests Over Limit

**Given** a limit of 2 requests per 1000 ms and 2 requests already made  
**When** a 3rd request is made within the same window  
**Then** it returns `{ success: false, remaining: 0 }`.

---

### AC-RATE-03: Sliding Window — Allows Requests After Window Expires

**Given** a limit of 2 requests per 1000 ms and 2 requests already made at t=0  
**When** a 3rd request is made at t=1001 ms (after the window)  
**Then** the oldest request has expired and the 3rd request returns `{ success: true }`.

---

### AC-RATE-04: IP Extraction — x-forwarded-for (TRUST_PROXY=true)

**Given** a request with header `x-forwarded-for: 198.51.100.7, 203.0.113.5`  
**When** `getClientIp(request, true)` is called  
**Then** it returns `"198.51.100.7"` (first IP only).

---

### AC-RATE-05: IP Extraction — x-real-ip Fallback (TRUST_PROXY=true)

**Given** a request with a blank `x-forwarded-for` and `x-real-ip: 203.0.113.9`  
**When** `getClientIp(request, true)` is called  
**Then** it returns `"203.0.113.9"`.

---

### AC-RATE-06: IP Extraction — No Trust Proxy

**Given** a request with `x-forwarded-for: 198.51.100.7`  
**When** `getClientIp(request, false)` is called  
**Then** it returns `"unknown"`.

---

### AC-SECURITY-01: CSRF — Mutating Request Without Origin Rejected

**Given** a POST request to a profile API endpoint without an `Origin` header  
**When** the request reaches the middleware  
**Then** the response is HTTP 403.

---

### AC-SECURITY-02: CSRF — GET Request Passes Without Origin

**Given** a GET request without an `Origin` header  
**When** the request reaches the middleware  
**Then** the request proceeds normally (no CSRF check).

---

### AC-SECURITY-03: CSRF — NextAuth Paths Excluded

**Given** a POST request to `/api/auth/callback/credentials` without a matching Origin  
**When** the request reaches the middleware  
**Then** the request is not rejected by CSRF middleware (NextAuth handles its own CSRF).

---

### AC-SECURITY-04: CSP — Nonce Set on Every Response

**Given** any page request  
**When** the response is returned  
**Then** it includes a `Content-Security-Policy` header containing a nonce value.

---

### AC-GAUGES-01: fixUpGauges — Forces allowDecimals on Specific Gauges

**Given** a profile where `manifoldPressure.allowDecimals = false`  
**When** `fixUpGauges(profile)` is called  
**Then** `manifoldPressure.allowDecimals = true` and all four `manifoldPressure.ranges[*].allowDecimals = true`.
The same applies to `fuelFlow` and `oilPressure`.

---

### AC-GAUGES-02: fixUpGauges — Backfills Missing Range IDs

**Given** a profile with gauge ranges that have no `id`  
**When** `fixUpGauges(profile)` is called  
**Then** every range across all gauges has a valid UUID `id`.

---

### AC-GAUGES-03: fixUpGauges — Existing IDs Not Overwritten

**Given** a profile with gauge ranges that already have `id` values  
**When** `fixUpGauges(profile)` is called  
**Then** the existing `id` values are preserved unchanged.

---

### AC-DEFAULT-01: createDefaultProfile — Returns Valid New Profile

**Given** `createDefaultProfile()` is called  
**When** the result is validated against `profileSchema`  
**Then** validation passes with no errors (after setting a non-null `owner` and `id`).

---

### AC-DEFAULT-02: createDefaultProfile — Aircraft Type is Piston

**Given** `createDefaultProfile()` is called  
**When** examining the result  
**Then** `aircraftType = 0` (Piston), `engines = 1`, `cylinders = 4`.

---

### AC-DEFAULT-03: createDefaultProfile — All Gauges Have 4 Ranges

**Given** `createDefaultProfile()` is called  
**When** examining every gauge  
**Then** each gauge has exactly 4 `GaugeRange` entries.

---

### AC-DEFAULT-04: createDefaultProfile — Flaps Defaults

**Given** `createDefaultProfile()` is called  
**When** examining `flapsRange`  
**Then** `markings[0] = "UP"`, `positions[0] = 0`, `markings[5] = "F"`, `positions[5] = 100`, and arrays have length 6.

---

### AC-UI-01: Home Page — Renders Without Auth

**Given** a visitor not signed in  
**When** they load `/`  
**Then** the page renders successfully with a hero section and links to Browse and Sign In.

---

### AC-UI-02: Browse Page — Shows Published Profiles

**Given** published profiles exist in the database  
**When** a visitor loads `/profiles`  
**Then** profile cards are displayed with name, author, aircraft type and engines.

---

### AC-UI-03: Browse Page — Filter by Aircraft Type

**Given** profiles of multiple types  
**When** the user selects "Piston" from the type filter  
**Then** only Piston profiles are shown.

---

### AC-UI-04: Browse Page — Search

**Given** profiles with different names  
**When** the user types a search term  
**Then** only matching profiles are displayed.

---

### AC-UI-05: Profile View — Accessible Without Auth

**Given** a published profile  
**When** a visitor loads `/profile/[id]`  
**Then** the profile details are displayed in read-only mode without needing to sign in.

---

### AC-UI-06: Profile Edit — Only Owner Can Edit

**Given** a signed-in user who is NOT the owner of a profile  
**When** they navigate to `/profile/[id]?edit=true`  
**Then** they are shown the read-only view (edit controls are not presented).

---

### AC-UI-07: Profile Edit — Owner Sees Edit Controls

**Given** a signed-in user who IS the owner of a profile  
**When** they navigate to `/profile/[id]?edit=true`  
**Then** the `ProfileEditor` is displayed with editable fields and Save/Cancel/Delete buttons.

---

### AC-UI-08: Create — Requires Auth

**Given** an unauthenticated visitor  
**When** they navigate to `/create`  
**Then** they are redirected to the sign-in page.

---

### AC-UI-09: Import — Requires Auth

**Given** an unauthenticated visitor  
**When** they navigate to `/import`  
**Then** they are redirected to the sign-in page.

---

### AC-UI-10: Navbar — Shows User Name When Signed In

**Given** a signed-in user named "Alice"  
**When** they view any page  
**Then** the navbar displays "Alice" and a sign-out option.

---

### AC-UI-11: Navbar — Shows Sign In Link When Not Signed In

**Given** an unauthenticated visitor  
**When** they view any page  
**Then** the navbar shows a "Sign In" link and a "Register" link.

---

### AC-UI-12: Export — Downloads JSON File

**Given** a user viewing a profile  
**When** they click "Export as JSON"  
**Then** a `.json` file is downloaded containing the profile data.

---

### AC-UI-13: Registration Page — Validates Client Side

**Given** a user on `/auth/register`  
**When** they submit the form with an empty name  
**Then** an error message is shown without navigating away.

---

### AC-UI-14: Sign-In Page — Redirects After Success

**Given** a user on `/auth/signin`  
**When** they sign in successfully  
**Then** they are redirected to the home page (or the originally requested page).

---

*End of document.*
