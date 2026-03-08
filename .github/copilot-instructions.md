# Copilot Instructions for Simionic G1000 Custom Profiles

## Project Overview

A full-stack web application that allows pilots to share and browse custom instrument-panel profiles for the Simionic G1000 flight simulator app. Users can register, upload/edit profiles (stored in MongoDB), and browse public profiles by aircraft type.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 · MongoDB 7 · NextAuth 5 (beta, Credentials provider) · Argon2 · Zod 3 · Bootstrap 5 · Nodemailer 7 · Node.js ≥ 18

---

## Build, Lint & Test

Always run these from the repository root. No extra bootstrap step is needed beyond `npm install`.

```bash
npm run lint            # ESLint 9 via eslint-config-next
npm run build           # next build  (type-check + production build)
npm run dev             # next dev    (local dev server)

npm run test:unit       # node:test unit tests — src/lib/*.test.ts
npm run test:integration # node:test integration tests — API routes + middleware
npm run test            # test:unit && test:integration  (no UI tests)
npm run test:ui         # Playwright e2e tests (requires dev server; see playwright.config.ts)
```

> All `test:unit` and `test:integration` scripts pass `--experimental-test-module-mocks` to tsx; do **not** strip that flag.

> UI tests mock every API call via `page.route()` in `tests/ui/helpers.ts` — no real MongoDB is needed for them.

---

## Architecture

### Three-layer server architecture (strict — do not cross layers)

```
API Route Handlers  (src/app/api/**/route.ts)
  → HTTP parsing, auth session check, error-to-HTTP-status mapping
  → NO business logic

Service Layer  (src/lib/profile-service.ts, user-service.ts)
  → Business rules, ownership checks, validation
  → Throws typed errors: NotFoundError | ForbiddenError | ValidationError | ConflictError
  → NO MongoDB knowledge

Data Store Layer  (src/lib/data-store.ts, user-store.ts, token-store.ts)
  → Raw MongoDB operations only
  → Converts camelCase ↔ PascalCase on every read/write via field-mapping.ts
```

**Error flow:** Service layer throws typed errors; API handlers catch them and map to HTTP status codes via `mapErrorToResponse()` in `src/lib/error-utils.ts`.

### Field-case convention

MongoDB stores all profile fields in **PascalCase** (matching the Simionic export format). TypeScript types use **camelCase**. `src/lib/field-mapping.ts` provides `toCamelCase()` / `toPascalCase()` — always call these in the data-store layer, never elsewhere.

### Key file locations

| Purpose | Path |
|---|---|
| Profile CRUD business logic | `src/lib/profile-service.ts` |
| User / auth business logic | `src/lib/user-service.ts` |
| MongoDB profile operations | `src/lib/data-store.ts` |
| Rate limiter | `src/lib/rate-limit.ts` |
| Zod profile schema | `src/lib/profile-schema.ts` |
| Gauge defaults + fixup | `src/lib/profile-utils.ts` |
| camelCase ↔ PascalCase | `src/lib/field-mapping.ts` |
| NextAuth config | `src/lib/auth.ts` |
| Edge middleware (CSP + CSRF) | `src/middleware.ts` |
| Shared TS types | `src/types/` |
| UI Playwright tests | `tests/ui/` |

---

## Testing Patterns

### Unit / integration tests (node:test)

- Use `node:test` + `node:assert/strict`. Import as `import { describe, it, before } from 'node:test'`.
- Mock modules with `mock.module()` inside a `before()` hook, then `await import('./module-under-test')` **after** the mock is registered.
- Pattern: close over mutable state with `let` variables; expose them through `mock.fn()` closures.
- Test files for `src/app/api/profiles/[id]/route.ts` live at `src/app/api/profiles/profile-id-route.test.ts` (bracket glob issue with node:test).

### Playwright UI tests

- All in `tests/ui/`. Mock auth via `page.route('/api/auth/session', ...)`.
- `tests/ui/helpers.ts` contains shared setup; `playwright.config.ts` starts `next dev` automatically.

---

## Security Requirements (non-negotiable)

- **CSRF:** `src/middleware.ts` checks `Origin` header on all mutating API calls (`POST`, `PUT`, `DELETE`, `PATCH` to `/api/*`). Always preserve this check.
- **Rate limiting:** All auth endpoints use `src/lib/rate-limit.ts`. Limits: register = 5/15 min → 429; forgot-password, reset-password, convert/complete = 10/15 min → 429.
- **Zero-disclosure:** `POST /api/auth/forgot-password` and `POST /api/auth/convert/request` always return HTTP 200 regardless of outcome.
- **CSP:** Middleware generates a per-request nonce and injects it into the `Content-Security-Policy` header. Do not use `unsafe-inline` for scripts.
- **Passwords:** Hashed with Argon2id. Common passwords blocked via `src/lib/common-passwords.ts`.
- **Tokens:** Reset and conversion tokens are 32 random bytes stored only as SHA-256 hashes.

---

## Project Principles

1. This is a **low-traffic, single-instance** app (hundreds of users, tens of concurrent sessions). Design accordingly — avoid over-engineering.
2. Security best practices must still be followed regardless of expected traffic. The site must not fall over or become insecure under a traffic spike.
3. Prefer **default/vanilla** configurations of Node, MongoDB, etc. Assume a plain deployment environment where costly hosting options are not practical.
4. Users are **non-technical**. Prefer clear, explanatory UI text over text that assumes technical knowledge.
5. Focus on **usability**.
