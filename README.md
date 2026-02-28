# Simionic G1000 Custom Profiles

A web application for creating, editing, sharing, and exporting custom instrument profiles for the [Simionic G1000](https://simionic.net/) flight simulator app. Profiles define gauge ranges, V-speeds, trim indicators, and other instrument parameters for piston, turboprop, and jet aircraft.

## Features

- **Browse & search** published profiles by aircraft type, engine count, and author
- **Create** new profiles from scratch with sensible defaults
- **Edit** gauge colour ranges, V-speeds, trim settings, flap positions, and more
- **Import** profiles from JSON files exported by the Simionic app or other users
- **Export** profiles as `.json` files for use in the Simionic G1000 app
- **Authentication** via email and password — only profile owners can edit their own profiles
- **Password reset** via email link (15-minute expiry)
- **Account conversion** for migrating existing Microsoft-authenticated accounts to local credentials

### Auth endpoint rate-limiting behavior

- `register`, `reset-password`, `convert/complete` return `429` with `Retry-After` when throttled.
- `forgot-password` and `convert/request` intentionally keep their normal `200` response shape when throttled (zero-disclosure), and include `Retry-After` where applicable.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) 16 (App Router) with React 19
- **Language:** TypeScript
- **Database:** MongoDB
- **Auth:** [NextAuth.js](https://next-auth.js.org/) 5 with Credentials provider (email + password)
- **Password hashing:** Argon2
- **Email:** Nodemailer (SMTP) for password reset and account conversion emails
- **Validation:** Zod
- **Styling:** Bootstrap 5 (static CSS)

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [MongoDB Community Edition](https://www.mongodb.com/try/download/community) (local) or a MongoDB Atlas connection string

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root:

```env
# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate-a-random-secret>

# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=simionic

# Email (optional — defaults to fake/dev email logger if omitted)
EMAIL_PROVIDER=smtp
SMTP_HOST=<your-smtp-host>
SMTP_PORT=587
SMTP_USER=<your-smtp-user>
SMTP_PASS=<your-smtp-password>
SMTP_FROM=noreply@example.com

# Rate limiting — set to true only when behind a trusted reverse proxy
# (see docs/hosting.md for details)
TRUST_PROXY=false
```

If running MongoDB locally with default settings, the `MONGODB_URI` and `MONGODB_DB` values above are the defaults and can be omitted.

Generate a secure `NEXTAUTH_SECRET` with:

```bash
openssl rand -base64 32
```

If `EMAIL_PROVIDER` is not set (or set to anything other than `smtp`), the app uses a development email logger that writes emails as `.html` files to an `email/` directory rather than sending them.

### 3. Set up MongoDB

Install and start MongoDB Community Edition. Verify it's running:

```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```

You should see `{ ok: 1 }`.

### 4. Migrate data into MongoDB (optional)

If you have a set of profile `.json` files, place them in the `data/` folder at the project root. Then run:

```bash
npm run migrate
```

This reads every `.json` file in `data/`, upserts each profile into the `simionic.profiles` MongoDB collection, and creates a unique index on the `id` field.

You can verify the import by checking the document count:

```bash
mongosh simionic --eval "db.profiles.countDocuments()"
```

Or browse the data visually using [MongoDB Compass](https://www.mongodb.com/products/compass) connected to `mongodb://localhost:27017`.

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev` | Start the Next.js development server |
| `build` | `npm run build` | Create a production build |
| `start` | `npm run start` | Start the production server |
| `lint` | `npm run lint` | Run ESLint |
| `migrate` | `npm run migrate` | Import `.json` files from `data/` into MongoDB |

## Project Structure

```
src/
  app/                    # Next.js App Router pages and API routes
    api/profiles/         # REST API for profile CRUD
    api/auth/             # Auth endpoints (register, forgot-password, reset, convert)
    auth/                 # Auth UI pages (signin, register, password reset, convert)
    profile/[id]/         # Profile view page
    create/               # New profile creation
    edit/[id]/            # Profile editor
    import/               # JSON file import
    profiles/             # Profile list / browse
    downloads/            # Downloads page
  components/             # React components (ProfileEditor, GaugeDisplay, etc.)
  lib/                    # Server-side utilities
    mongodb.ts            # MongoDB client singleton
    data-store.ts         # Data access layer (getAllProfiles, getProfile, upsertProfile)
    profile-service.ts    # Business logic with typed error classes
    user-store.ts         # User account CRUD operations
    user-service.ts       # User business logic
    token-store.ts        # Password reset and conversion token management
    auth.ts               # NextAuth.js configuration (Credentials provider)
    rate-limit.ts         # In-memory sliding-window rate limiter
    profile-utils.ts      # Default profile creation & gauge fixups
    profile-schema.ts     # Zod validation schemas
    email/                # Email service abstraction (SMTP + fake implementations)
    export.ts             # Client-side JSON export helper
  types/                  # TypeScript interfaces & enums
  middleware.ts           # CSP nonce generation + CSRF protection
scripts/
  migrate-to-mongo.ts     # Data migration script
public/                   # Static assets (CSS, images)
data/                     # JSON profile files (migration source)
```

## Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:

- [`docs/architecture.md`](docs/architecture.md) — System architecture, request lifecycle, and data flow (with ASCII diagrams)
- [`docs/implementation.md`](docs/implementation.md) — In-depth implementation guide for Next.js developers
- [`docs/hosting.md`](docs/hosting.md) — Hosting and deployment guide (single-server, PM2, Nginx, Docker)
