# Architecture

This document describes the high-level architecture of the Simionic G1000 Custom Profiles application. It is aimed at developers with Next.js experience who need to understand how the system fits together.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Directory Layout](#directory-layout)
4. [Request Lifecycle](#request-lifecycle)
5. [Layer Architecture](#layer-architecture)
6. [Authentication Architecture](#authentication-architecture)
7. [Data Architecture](#data-architecture)
8. [Security Architecture](#security-architecture)
9. [Email Architecture](#email-architecture)
10. [Client-Side Architecture](#client-side-architecture)

---

## System Overview

The application is a single Next.js process that serves both the React UI and a JSON REST API. A single MongoDB instance provides persistence. There is no separate backend service.

```
 Browser
    |
    | HTTPS
    v
+-------------------+
|   Next.js Server  |   (Node.js process — serves UI and API)
|                   |
|  Middleware layer |   CSP nonce generation, CSRF check
|  App Router pages |   React Server Components + Client Components
|  API Route handlers   REST endpoints under /api/
+-------------------+
    |
    | MongoDB Wire Protocol (TCP)
    v
+-------------------+
|     MongoDB       |   Single mongod instance
|                   |
|  profiles         |   Profile documents
|  users            |   Registered accounts
|  password_reset_codes
|  conversion_tokens|
+-------------------+
```

All user-facing HTML is rendered server-side or via client-side React hydration. The application follows Next.js App Router conventions throughout.

---

## Technology Stack

| Layer              | Technology                          | Version   |
|--------------------|-------------------------------------|-----------|
| Framework          | Next.js (App Router)                | 16.1.6    |
| UI library         | React                               | 19.2.3    |
| Language           | TypeScript                          | 5.x       |
| Database driver    | mongodb (official Node.js driver)   | 7.x       |
| Authentication     | NextAuth.js (Credentials provider)  | 5.0 beta  |
| Password hashing   | Argon2                              | 0.44.x    |
| Schema validation  | Zod                                 | 3.x       |
| Email              | Nodemailer                          | 7.x       |
| CSS framework      | Bootstrap 5 (static file)           | 5.x       |
| Icon font          | Bootstrap Icons + Open Iconic       | static    |
| Linter             | ESLint 9 (eslint-config-next)       | 9.x       |

**Runtime target:** Node.js 18 or later (required for `crypto.getRandomValues`, Web Crypto API in middleware, and native `fetch`).

---

## Directory Layout

```
project-root/
|
+-- src/
|   |
|   +-- app/                        Next.js App Router root
|   |   |
|   |   +-- api/                    API route handlers (server-only)
|   |   |   +-- profiles/
|   |   |   |   +-- route.ts        GET /api/profiles  (list)
|   |   |   |   +-- [id]/
|   |   |   |       +-- route.ts    GET/POST/DELETE /api/profiles/[id]
|   |   |   |
|   |   |   +-- auth/
|   |   |       +-- [...nextauth]/
|   |   |       |   +-- route.ts    NextAuth catch-all handler
|   |   |       +-- register/
|   |   |       |   +-- route.ts    POST /api/auth/register
|   |   |       +-- forgot-password/
|   |   |       |   +-- route.ts    POST /api/auth/forgot-password
|   |   |       +-- reset-password/
|   |   |       |   +-- route.ts    POST /api/auth/reset-password
|   |   |       +-- convert/
|   |   |           +-- check/
|   |   |           |   +-- route.ts  GET /api/auth/convert/check
|   |   |           +-- request/
|   |   |           |   +-- route.ts  POST /api/auth/convert/request
|   |   |           +-- complete/
|   |   |               +-- route.ts  POST /api/auth/convert/complete
|   |   |
|   |   +-- auth/                   Auth UI pages
|   |   |   +-- signin/page.tsx
|   |   |   +-- register/page.tsx
|   |   |   +-- forgot-password/page.tsx
|   |   |   +-- reset-password/page.tsx
|   |   |   +-- convert/page.tsx
|   |   |   +-- convert/[token]/page.tsx
|   |   |
|   |   +-- profile/[id]/page.tsx   Profile view (read-only)
|   |   +-- create/page.tsx         New profile form
|   |   +-- edit/[id]/page.tsx      Profile editor
|   |   +-- import/page.tsx         JSON import page
|   |   +-- profiles/page.tsx       Browse/search profiles
|   |   +-- downloads/page.tsx      Downloads page
|   |   +-- about/page.tsx
|   |   +-- faq/page.tsx
|   |   +-- privacy/page.tsx
|   |   +-- terms/page.tsx
|   |   +-- contact/page.tsx
|   |   |
|   |   +-- layout.tsx              Root layout (Navbar, Footer, AuthProvider)
|   |   +-- page.tsx                Home page
|   |   +-- globals.css             Global CSS resets
|   |   +-- error.tsx               Route error boundary
|   |   +-- global-error.tsx        Root error boundary
|   |   +-- not-found.tsx           404 page
|   |
|   +-- components/                 Shared React components
|   |   +-- AuthProvider.tsx        NextAuth SessionProvider wrapper
|   |   +-- Navbar.tsx
|   |   +-- Footer.tsx
|   |   +-- ProfileCard.tsx         Profile summary card
|   |   +-- ProfileCardSkeleton.tsx Loading placeholder
|   |   +-- ProfileFilters.tsx      Aircraft type / engine filter UI
|   |   +-- ProfileEditor.tsx       Full profile editing form
|   |   +-- GaugeDisplay.tsx        Gauge visualisation + range editor
|   |   +-- Notice.tsx              Alert/info banner
|   |
|   +-- lib/                        Server-side library code
|   |   +-- mongodb.ts              MongoClient singleton
|   |   +-- data-store.ts           Raw DB operations (profiles collection)
|   |   +-- profile-service.ts      Business logic + typed errors
|   |   +-- user-store.ts           Raw DB operations (users collection)
|   |   +-- user-service.ts         User business logic
|   |   +-- token-store.ts          Reset/conversion token DB operations
|   |   +-- auth.ts                 NextAuth configuration
|   |   +-- rate-limit.ts           In-memory sliding-window rate limiter
|   |   +-- password.ts             Argon2 hash + verify
|   |   +-- email-validator.ts      Practical email validation
|   |   +-- common-passwords.ts     Common password blocklist loader
|   |   +-- profile-schema.ts       Zod schema for profile validation
|   |   +-- profile-utils.ts        Default profile factory + gauge fixup
|   |   +-- field-mapping.ts        camelCase <-> PascalCase conversion
|   |   +-- export.ts               Client-side JSON download helper
|   |   +-- owner-id.ts             Owner ID extraction utilities
|   |   +-- error-utils.ts          Shared error handling helpers
|   |   +-- init.ts                 Startup DB index initialization
|   |   +-- email/
|   |       +-- types.ts            EmailService interface
|   |       +-- index.ts            Factory (smtp vs fake)
|   |       +-- smtp-email-service.ts
|   |       +-- fake-email-service.ts
|   |
|   +-- types/                      Shared TypeScript types
|   |   +-- profile.ts              Profile, ProfileSummary, VSpeeds, etc.
|   |   +-- gauge.ts                Gauge, GaugeRange
|   |   +-- enums.ts                AircraftType, RangeColour
|   |   +-- index.ts                Re-exports
|   |   +-- next-auth.d.ts          Session type augmentation
|   |
|   +-- proxy.ts                   Edge middleware (CSP + CSRF)
|   +-- instrumentation.ts          Startup hook (DB index init)
|
+-- scripts/
|   +-- migrate-to-mongo.ts         One-time JSON -> MongoDB import
|
+-- public/                         Served as static files
|   +-- css/                        Bootstrap, Open Iconic, custom CSS
|   +-- img/                        Aircraft type images
|
+-- data/                           Source JSON profiles for migration
+-- next.config.ts                  Next.js configuration + security headers
+-- tsconfig.json
+-- eslint.config.mjs
+-- package.json
```

---

## Request Lifecycle

### Page request (Server Component)

```
Browser
  |
  | GET /profiles?type=0
  v
Middleware (src/proxy.ts)
  |  1. Generate 16-byte random nonce
  |  2. Build CSP header string including nonce
  |  3. Attach x-nonce + content-security-policy to request headers
  |  4. Set Content-Security-Policy on response headers
  v
App Router
  |  Resolves /profiles -> src/app/profiles/page.tsx
  v
React Server Component (profiles/page.tsx)
  |  1. Read x-nonce from request headers (via next/headers)
  |  2. Call internal lib functions or fetch /api/profiles
  |  3. Render HTML with data
  v
Browser
  |  Receives HTML + CSP header
  |  Hydrates interactive ("use client") components
```

### API request (mutating)

```
Browser
  |
  | POST /api/profiles/[id]
  | Origin: https://example.com
  | Content-Type: application/json
  v
Middleware (src/proxy.ts)
  |  CSRF check: origin header must match request.nextUrl.origin
  |  If mismatch -> return 403 Forbidden
  v
API Route Handler (app/api/profiles/[id]/route.ts)
  |  1. Call auth() to get session from JWT cookie
  |  2. Validate session (401 if missing)
  |  3. Parse request body as JSON
  |  4. Call profile-service.saveProfile()
  v
profile-service.ts
  |  1. Validate UUID format
  |  2. Zod schema validation (ValidationError on failure)
  |  3. Load existing profile from DB
  |  4. Check ownership (ForbiddenError if mismatch)
  |  5. Set owner fields
  |  6. Call data-store.upsertProfile()
  v
data-store.ts
  |  1. Convert camelCase fields to PascalCase for MongoDB storage
  |  2. Set LastUpdated timestamp
  |  3. MongoDB updateOne with upsert: true
  v
MongoDB
```

---

## Layer Architecture

The application uses a strict three-layer architecture on the server side:

```
+--------------------------------------------------+
|              API Route Handlers                  |
|  (src/app/api/**/route.ts)                       |
|  - HTTP parsing / auth session check             |
|  - Error-to-status-code mapping                  |
|  - No business logic                             |
+--------------------------------------------------+
                      |
                      v
+--------------------------------------------------+
|              Service Layer                       |
|  (src/lib/profile-service.ts, user-service.ts)  |
|  - Business rules (ownership check, validation)  |
|  - Typed error classes (NotFoundError, etc.)     |
|  - No MongoDB knowledge                          |
+--------------------------------------------------+
                      |
                      v
+--------------------------------------------------+
|              Data Store Layer                    |
|  (src/lib/data-store.ts, user-store.ts,          |
|   token-store.ts)                               |
|  - Raw MongoDB operations                        |
|  - Index management                              |
|  - Field-case conversion (camelCase <-> Pascal)  |
+--------------------------------------------------+
                      |
                      v
+--------------------------------------------------+
|              MongoDB Client                      |
|  (src/lib/mongodb.ts)                            |
|  - Singleton MongoClient                         |
|  - getDb() helper                                |
+--------------------------------------------------+
```

**Error flow:** Service layer throws typed errors (`ValidationError`, `NotFoundError`, `ForbiddenError`). API handlers catch these and map them to appropriate HTTP status codes via a shared `mapErrorToResponse()` helper.

---

## Authentication Architecture

Authentication uses NextAuth.js 5 (beta) with a single Credentials provider (email + password). There is no OAuth/social login.

### Session strategy

NextAuth uses JWT sessions (no database session table). The JWT is stored in an HTTP-only cookie managed by NextAuth.

The catch-all route at `src/app/api/auth/[...nextauth]/route.ts` wraps NextAuth's POST handler in a per-IP rate limit of 10 requests per 15 minutes.

```
User submits login form
        |
        v
POST /api/auth/callback/credentials  (NextAuth internal)
        |
        v
auth.ts: authorize()
        |  1. findUserByEmail(email)          -> users collection
        |  2. verifyPassword(hash, password)  -> argon2.verify()
        |  3. return { id: ownerId, email, name }
        v
NextAuth: jwt() callback
        |  Injects user.id as token.ownerId into the JWT payload
        v
NextAuth: session() callback
        |  Copies token.ownerId -> session.ownerId
        v
HTTP-only JWT cookie set on browser
```

### Accessing the session in route handlers

```typescript
// Server Component or API route
import { auth } from "@/lib/auth";
const session = await auth();
// session.ownerId  -- the profile owner's UUID
// session.user     -- { name, email }
```

### Session type augmentation

`src/types/next-auth.d.ts` extends the NextAuth `Session` type to include `ownerId`:

```typescript
declare module "next-auth" {
  interface Session {
    ownerId?: string;
  }
}
```

### Account conversion flow

When an existing profile has an owner ID from a now-removed Microsoft/Azure AD provider, the conversion flow creates a local account linked to that owner ID and migrates all profiles:

```
User requests conversion email
  -> POST /api/auth/convert/request
  -> createConversionToken(email)  stored as SHA-256 hash
  -> Email sent with link containing raw token

User clicks link  /auth/convert/[token]
  -> GET page (token in URL, rendered server-side)
  -> User fills in name + password form

User submits form
  -> POST /api/auth/convert/complete { token, email, name, password }
  -> getConversionToken(token)  verifies hash + expiry
  -> MongoDB transaction:
       createUserIdempotent(email, name, passwordHash)
       updateProfileOwner(oldOwnerId, newOwnerId, newOwnerName)
       markConversionTokenUsed(token)
  -> Return new ownerId to client
```

The conversion is wrapped in a MongoDB transaction to ensure atomicity.

---

## Data Architecture

### MongoDB collections

```
simionic (database)
|
+-- profiles
|     Primary data store. One document per aircraft profile.
|     Indexed: { id: 1 } unique, { LastUpdated: -1 }
|
+-- users
|     One document per registered user.
|     Indexed: { email: 1 } unique, { ownerId: 1 }
|
+-- password_reset_codes
|     Short-lived tokens for the forgot-password flow.
|     Indexed: { expiresAt: 1 } TTL, { email: 1 }
|
+-- conversion_tokens
|     Short-lived tokens for the account conversion flow.
|     Indexed: { expiresAt: 1 } TTL, { tokenHash: 1 } unique
```

### Field-case convention

The Simionic app exports profiles using PascalCase field names (e.g., `AircraftType`, `IsPublished`). MongoDB documents preserve PascalCase. The application's TypeScript types use camelCase. `src/lib/field-mapping.ts` provides `toCamelCase()` and `toPascalCase()` helpers that are called in the data-store layer on every read and write.

```
MongoDB document:  { AircraftType: 0, IsPublished: true, Owner: { Id: "...", Name: "..." } }
                         |
                   toCamelCase()
                         |
TypeScript object: { aircraftType: 0, isPublished: true, owner: { id: "...", name: "..." } }
```

The special-case lowercase `id` field (profile UUID) is preserved as-is on both sides.

### Profile ownership

Each profile stores an `Owner` sub-document:

```
Owner: {
  Id:   string | null   (the user's ownerId UUID)
  Name: string | null   (display name at time of save)
}
```

`null` ownership means the profile was imported/migrated without a known owner. Null-owned profiles can be read by anyone but cannot be edited via the API (a `ForbiddenError` would be thrown because `null !== ownerId`).

### Index initialization

Indexes are created at startup via `src/instrumentation.ts` → `src/lib/init.ts`, which calls `initUserStore()`, `initTokenStore()`, and `initProfileStore()`. This ensures indexes exist before any request is served.

---

## Security Architecture

### Middleware (Edge)

`src/proxy.ts` runs on every request (excluding `_next/static`, `_next/image`, `favicon.ico`):

1. **CSP nonce**: Generates a 16-byte cryptographically random nonce per request. Injects it into the `Content-Security-Policy` header with `script-src 'nonce-{nonce}' 'strict-dynamic'`. This avoids `unsafe-inline` for scripts while still allowing Next.js internal scripts.

2. **CSRF protection**: For mutating requests (`POST`, `PUT`, `DELETE`, `PATCH`) to `/api/*`, verifies that the `Origin` header matches the application's own origin. Returns `403` if it does not match.

### Security headers (next.config.ts)

Applied to all responses:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=(), microphone=()
```

### Rate limiting

`src/lib/rate-limit.ts` implements an in-memory sliding-window rate limiter. Applied to all auth endpoints.

**Important caveat:** The rate limiter is process-local. In a multi-process deployment (e.g., PM2 cluster mode, multiple Node.js workers), each process has an independent counter. See [hosting.md](hosting.md) for deployment implications.

IP extraction for rate limiting requires the `TRUST_PROXY=true` environment variable to be set when the app is behind a trusted reverse proxy. Without it, all requests share a single `"unknown"` bucket — a safe but broad fallback.

### Password security

- Passwords are hashed with Argon2 (argon2id variant) before storage.
- Passwords must be between 8 and 1024 characters.
- Common passwords are checked against a blocklist during registration.
- Password reset tokens are 32 random bytes, stored only as SHA-256 hashes, and expire after 15 minutes.
- Conversion tokens are 32 random bytes, stored only as SHA-256 hashes, and expire after 24 hours.

---

## Email Architecture

The email subsystem uses a simple interface (`EmailService`) with two implementations:

```
src/lib/email/
|
+-- types.ts                  interface EmailService { sendEmail() }
+-- index.ts                  Factory: getEmailService() -> smtp | fake
+-- smtp-email-service.ts     Production: Nodemailer SMTP transport
+-- fake-email-service.ts     Development: writes .html files to email/ dir
```

The factory reads `process.env.EMAIL_PROVIDER`:
- `"smtp"` → `SmtpEmailService` (requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
- anything else → `FakeEmailService` (no SMTP required; useful for development)

`FakeEmailService` writes each outgoing email to an `.html` file under `email/` in the project root, allowing developers to inspect reset and conversion links without configuring a real mail server.

---

## Client-Side Architecture

Pages in the App Router can contain a mix of Server Components and Client Components. The general pattern used in this application:

```
Page (Server Component)
  |  Fetches initial data from the DB or API
  |  Renders the static shell of the page
  v
Interactive Component ("use client")
  |  Receives initial data as props
  |  Handles user interactions
  |  Calls /api/* endpoints for mutations
```

### Key client components

| Component           | Purpose                                                        |
|---------------------|----------------------------------------------------------------|
| `AuthProvider`      | Wraps the app in NextAuth's `SessionProvider` (React context)  |
| `ProfileEditor`     | Full profile editing form; POSTs to `/api/profiles/[id]`       |
| `GaugeDisplay`      | Visualises gauge colour ranges; used inside `ProfileEditor`    |
| `ProfileCard`       | Displays a profile summary card in the browse list            |
| `ProfileFilters`    | Aircraft type / engine count / search text filter controls     |
| `ProfileCardSkeleton` | Loading placeholder skeleton for `ProfileCard`               |
| `Navbar`            | Top navigation; reads session via `useSession()`               |

### Session access from client components

Client components access the session through NextAuth's `useSession()` hook, which is provided by the `AuthProvider` (`SessionProvider`) wrapper in `layout.tsx`. The session exposes `session.ownerId` (via the type augmentation in `next-auth.d.ts`).
