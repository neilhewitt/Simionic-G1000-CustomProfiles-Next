# Simionic G1000 Custom Profiles

A web application for creating, editing, sharing, and exporting custom instrument profiles for the [Simionic G1000](https://simionic.net/) flight simulator app. Profiles define gauge ranges, V-speeds, trim indicators, and other instrument parameters for piston, turboprop, and jet aircraft.

## Features

- **Browse & search** published profiles by aircraft type, engine count, and author
- **Create** new profiles from scratch with sensible defaults
- **Edit** gauge colour ranges, V-speeds, trim settings, flap positions, and more
- **Import** profiles from JSON files exported by the Simionic app or other users
- **Export** profiles as `.json` files for use in the Simionic G1000 app
- **Authentication** via Microsoft account (Azure AD) — only profile owners can edit their own profiles

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) 16 (App Router) with React 19
- **Language:** TypeScript
- **Database:** MongoDB
- **Auth:** [NextAuth.js](https://next-auth.js.org/) with Azure AD provider
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

Create a `.env.local` file in the project root (or edit the existing one):

```env
# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate-a-random-secret>

# Azure AD (Microsoft login)
AZURE_AD_CLIENT_ID=<your-client-id>
AZURE_AD_CLIENT_SECRET=<your-client-secret>

# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=simionic
```

If running MongoDB locally with default settings, the `MONGODB_URI` and `MONGODB_DB` values above are the defaults and can be omitted.

### 3. Set up MongoDB

Install and start MongoDB Community Edition. Verify it's running:

```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```

You should see `{ ok: 1 }`.

### 4. Migrate data into MongoDB

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
  app/                  # Next.js App Router pages and API routes
    api/profiles/       # REST API for profile CRUD
    api/auth/           # NextAuth.js auth endpoints
    profile/[id]/       # Profile view & edit page
    create/             # New profile creation
    import/             # JSON file import
    profiles/           # Profile list / browse
  components/           # React components (ProfileEditor, GaugeDisplay, etc.)
  lib/                  # Server-side utilities
    mongodb.ts          # MongoDB client singleton
    data-store.ts       # Data access layer (getAllProfiles, getProfile, upsertProfile)
    auth.ts             # NextAuth.js configuration
    profile-utils.ts    # Default profile creation & gauge fixups
    export.ts           # Client-side JSON export
  types/                # TypeScript interfaces & enums
scripts/
  migrate-to-mongo.ts   # Data migration script
public/                 # Static assets (CSS, images)
data/                   # JSON profile files (migration source)
```
