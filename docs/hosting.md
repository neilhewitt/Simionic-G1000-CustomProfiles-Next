# Hosting Guide

This document describes how to host the Simionic G1000 Custom Profiles application in various environments. It focuses on self-hosted (non-cloud) deployments where both the Next.js application and MongoDB run on the same server.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Build the Application](#build-the-application)
3. [Single Server — PM2 + Nginx (Recommended)](#single-server--pm2--nginx-recommended)
4. [Single Server — Systemd Service (Alternative)](#single-server--systemd-service-alternative)
5. [Docker (Single Container)](#docker-single-container)
6. [Docker Compose (App + MongoDB)](#docker-compose-app--mongodb)
7. [Vercel (Managed Hosting)](#vercel-managed-hosting)
8. [Environment Variable Reference](#environment-variable-reference)
9. [MongoDB Configuration](#mongodb-configuration)
10. [Security Checklist](#security-checklist)
11. [Rate Limiting Considerations](#rate-limiting-considerations)
12. [Maintenance and Updates](#maintenance-and-updates)

---

## Prerequisites

All self-hosted deployments require:

- **Node.js 18 or later** — needed for Web Crypto API (`crypto.getRandomValues`) used in the middleware
- **MongoDB 6 or later** — earlier versions may work but are untested
- A **domain name** with DNS pointing to your server (required for HTTPS and the `NEXTAUTH_URL` env var)
- An **SSL/TLS certificate** (Let's Encrypt via Certbot is the easiest option for self-hosted)

---

## Build the Application

Before deploying to any environment, build the production bundle:

```bash
npm install --omit=dev   # or: npm ci --omit=dev
npm run build
```

The build output goes to `.next/`. This directory must be present on the server alongside `node_modules`, `public/`, `package.json`, and the environment variable configuration.

Do **not** run `npm run dev` in production — it is slow, uses more memory, and disables optimisations.

---

## Single Server — PM2 + Nginx (Recommended)

This is the recommended setup for a single-server deployment. PM2 manages the Node.js process lifecycle; Nginx handles TLS termination and acts as a reverse proxy.

```
Internet
    |
    | HTTPS :443
    v
+----------+
|  Nginx   |  TLS termination, reverse proxy, static asset serving
+----------+
    |
    | HTTP :3000 (loopback only)
    v
+----------+
|   PM2    |  Process manager: keeps Node.js alive, auto-restarts on crash
| (Next.js)|
+----------+
    |
    | MongoDB wire protocol :27017 (loopback only)
    v
+----------+
|  mongod  |  Single MongoDB instance
+----------+
```

### Step 1: Install Node.js

```bash
# Using NodeSource (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version   # should be v20.x or later
npm --version
```

### Step 2: Install MongoDB

```bash
# Ubuntu 22.04 example — see https://www.mongodb.com/docs/manual/installation/
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt-get update
sudo apt-get install -y mongodb-org

# Enable and start the service
sudo systemctl enable mongod
sudo systemctl start mongod

# Verify
mongosh --eval "db.runCommand({ ping: 1 })"
```

MongoDB binds to `127.0.0.1:27017` by default. Leave it that way — do **not** expose it to the network unless you have a specific need and have configured authentication.

### Step 3: Install PM2

```bash
sudo npm install -g pm2
```

### Step 4: Deploy the application

```bash
# Create an application directory
sudo mkdir -p /var/www/g1000profiles
sudo chown $USER:$USER /var/www/g1000profiles

# Copy the built application (or clone and build directly on the server)
# Option A: Build on the server
cd /var/www/g1000profiles
git clone https://github.com/yourfork/Simionic-G1000-CustomProfiles-Next.git .
npm ci --omit=dev
npm run build

# Option B: Build locally and rsync the output
rsync -avz --exclude node_modules --exclude .git ./ user@server:/var/www/g1000profiles/
ssh user@server "cd /var/www/g1000profiles && npm ci --omit=dev"
```

### Step 5: Configure environment variables

Create `/var/www/g1000profiles/.env.local`:

```env
NEXTAUTH_URL=https://yourdomain.com
NEXTAUTH_SECRET=<output of: openssl rand -base64 32>

MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=simionic

EMAIL_PROVIDER=smtp
SMTP_HOST=mail.yourprovider.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=<smtp-password>
SMTP_FROM=noreply@yourdomain.com

TRUST_PROXY=true
```

Set permissions so that only the process owner can read this file:

```bash
chmod 600 /var/www/g1000profiles/.env.local
```

### Step 6: Start the application with PM2

Create a PM2 ecosystem file at `/var/www/g1000profiles/ecosystem.config.js`:

```js
module.exports = {
  apps: [
    {
      name: "g1000profiles",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/var/www/g1000profiles",
      instances: 1,          // keep at 1 — rate limiter is in-memory (see below)
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
```

Start and save the process list so it survives reboots:

```bash
pm2 start /var/www/g1000profiles/ecosystem.config.js
pm2 save
pm2 startup    # follow the printed instruction to enable PM2 on boot
```

Verify the app is running:

```bash
pm2 status
curl http://127.0.0.1:3000/api/profiles   # should return JSON
```

### Step 7: Configure Nginx

Install Nginx and Certbot:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/g1000profiles`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect all HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificates (managed by Certbot)
    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Proxy to Next.js
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Required for WebSocket support (Next.js hot-reload not needed in prod,
        # but included for completeness)
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward real client IP and host
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }

    # Optional: serve Next.js static assets directly from Nginx
    # This bypasses Node.js for static files and reduces load
    location /_next/static/ {
        alias /var/www/g1000profiles/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /css/ {
        alias /var/www/g1000profiles/public/css/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /img/ {
        alias /var/www/g1000profiles/public/img/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site and obtain an SSL certificate:

```bash
sudo ln -s /etc/nginx/sites-available/g1000profiles /etc/nginx/sites-enabled/
sudo nginx -t
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo systemctl reload nginx
```

Certbot automatically sets up a cron job to renew the certificate before it expires.

### Step 8: Import existing profiles (optional)

If you have `.json` profile files to import:

```bash
cd /var/www/g1000profiles
mkdir -p data
# copy .json files into data/
npm run migrate
```

---

## Single Server — Systemd Service (Alternative)

If you prefer not to use PM2, you can run Next.js as a systemd service.

Create `/etc/systemd/system/g1000profiles.service`:

```ini
[Unit]
Description=Simionic G1000 Custom Profiles
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/g1000profiles
ExecStart=/usr/bin/node node_modules/.bin/next start
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=g1000profiles

# Load environment from file
EnvironmentFile=/var/www/g1000profiles/.env.local
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable g1000profiles
sudo systemctl start g1000profiles
sudo systemctl status g1000profiles
```

View logs:

```bash
journalctl -u g1000profiles -f
```

---

## Docker (Single Container)

This Dockerfile builds a production-ready image. It does **not** include MongoDB — you must provide a MongoDB connection string via `MONGODB_URI`.

Create `Dockerfile` in the project root:

```dockerfile
FROM node:20-alpine AS base

# Install dependencies layer
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build layer
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
```

**Note:** The standalone output mode must be enabled in `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  output: "standalone",
  // ... rest of config
};
```

Build and run:

```bash
docker build -t g1000profiles .

docker run -d \
  --name g1000profiles \
  -p 3000:3000 \
  -e NEXTAUTH_URL=https://yourdomain.com \
  -e NEXTAUTH_SECRET=<secret> \
  -e MONGODB_URI=mongodb://host.docker.internal:27017 \
  -e MONGODB_DB=simionic \
  -e EMAIL_PROVIDER=smtp \
  -e SMTP_HOST=mail.example.com \
  -e SMTP_PORT=587 \
  -e SMTP_USER=noreply@example.com \
  -e SMTP_PASS=<password> \
  -e SMTP_FROM=noreply@example.com \
  -e TRUST_PROXY=true \
  g1000profiles
```

On Linux, replace `host.docker.internal` with the host's IP address or use `--network=host`.

---

## Docker Compose (App + MongoDB)

A complete self-contained deployment with both the Next.js app and MongoDB in containers.

Create `docker-compose.yml` in the project root:

```yaml
version: "3.9"

services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NEXTAUTH_URL: "https://yourdomain.com"
      NEXTAUTH_SECRET: "${NEXTAUTH_SECRET}"
      MONGODB_URI: "mongodb://mongo:27017"
      MONGODB_DB: "simionic"
      EMAIL_PROVIDER: "${EMAIL_PROVIDER:-fake}"
      SMTP_HOST: "${SMTP_HOST:-}"
      SMTP_PORT: "${SMTP_PORT:-587}"
      SMTP_USER: "${SMTP_USER:-}"
      SMTP_PASS: "${SMTP_PASS:-}"
      SMTP_FROM: "${SMTP_FROM:-}"
      TRUST_PROXY: "true"
    depends_on:
      mongo:
        condition: service_healthy

  mongo:
    image: mongo:7
    restart: unless-stopped
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.runCommand({ ping: 1 })"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mongo_data:
```

Create a `.env` file (not `.env.local`) in the project root with secrets:

```env
NEXTAUTH_SECRET=<your-secret>
EMAIL_PROVIDER=smtp
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=<smtp-password>
SMTP_FROM=noreply@example.com
```

Deploy:

```bash
docker compose up -d
docker compose logs -f app
```

For the Nginx reverse proxy, run it on the host or add it as a fourth service in the Compose file. If running Nginx on the host, proxy to `http://127.0.0.1:3000` as shown in the PM2 + Nginx section above.

---

## Vercel (Managed Hosting)

Vercel is the simplest option if you can use a cloud MongoDB (Atlas free tier works well).

1. Push the repository to GitHub.
2. Import the repository in the [Vercel dashboard](https://vercel.com/).
3. Set environment variables in the Vercel project settings:
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (your Vercel deployment URL, e.g. `https://yourproject.vercel.app`)
   - `MONGODB_URI` (MongoDB Atlas connection string)
   - `MONGODB_DB`
   - Email variables if needed
   - Do **not** set `TRUST_PROXY` — Vercel handles IP forwarding transparently
4. Deploy.

Vercel automatically sets `NODE_ENV=production` and handles TLS, scaling, and CI/CD.

**Note:** On Vercel, each API route runs as a serverless function. The in-memory rate limiter (`src/lib/rate-limit.ts`) is reset on every cold start and is not shared across function instances. For effective rate limiting on Vercel, replace the in-memory store with a Redis-backed implementation (e.g., using Upstash Redis).

---

## Environment Variable Reference

| Variable          | Required | Default         | Notes                                                              |
|-------------------|----------|-----------------|--------------------------------------------------------------------|
| `NEXTAUTH_URL`    | Yes      | —               | Full URL including scheme, e.g. `https://yourdomain.com`           |
| `NEXTAUTH_SECRET` | Yes      | —               | Min 32 random bytes. Generate: `openssl rand -base64 32`           |
| `MONGODB_URI`     | Yes      | —               | Full connection string, e.g. `mongodb://127.0.0.1:27017`           |
| `MONGODB_DB`      | No       | `simionic`      | Database name                                                      |
| `EMAIL_PROVIDER`  | No       | `fake`          | `smtp` to send real emails; anything else uses the fake logger     |
| `SMTP_HOST`       | If smtp  | —               | SMTP server hostname                                               |
| `SMTP_PORT`       | If smtp  | —               | SMTP port, typically `587` (STARTTLS) or `465` (TLS)               |
| `SMTP_USER`       | If smtp  | —               | SMTP auth username                                                 |
| `SMTP_PASS`       | If smtp  | —               | SMTP auth password                                                 |
| `SMTP_FROM`       | If smtp  | —               | From address, e.g. `noreply@yourdomain.com`                        |
| `TRUST_PROXY`     | No       | `false`         | Set to `true` only behind a trusted proxy that strips X-Forwarded-For |
| `PORT`            | No       | `3000`          | Port that `next start` listens on                                  |

---

## MongoDB Configuration

### Binding and firewall

By default, MongoDB binds only to `127.0.0.1`. This is correct for a single-server deployment — do not change it. Verify with:

```bash
mongosh --eval "db.adminCommand({ getCmdLineOpts: 1 }).parsed.net.bindIp"
```

If the server has a firewall (recommended), block external access to port 27017:

```bash
# UFW example
sudo ufw deny 27017
```

### Authentication

For a single-server deployment where MongoDB is only accessible via localhost, authentication is optional but recommended. To enable it:

```bash
# Create an admin user
mongosh admin --eval "
  db.createUser({
    user: 'admin',
    pwd: '<admin-password>',
    roles: [{ role: 'userAdminAnyDatabase', db: 'admin' }]
  })
"

# Create an application user
mongosh admin -u admin -p '<admin-password>' --eval "
  db.createUser({
    user: 'g1000app',
    pwd: '<app-password>',
    roles: [{ role: 'readWrite', db: 'simionic' }]
  })
"
```

Enable authentication in `/etc/mongod.conf`:

```yaml
security:
  authorization: enabled
```

Restart MongoDB:

```bash
sudo systemctl restart mongod
```

Update `MONGODB_URI` in `.env.local`:

```env
MONGODB_URI=mongodb://g1000app:<app-password>@127.0.0.1:27017/simionic?authSource=simionic
```

### Backups

For a non-cloud deployment, set up regular backups with `mongodump`:

```bash
# Full database backup
mongodump --db simionic --out /var/backups/mongo/$(date +%Y%m%d)

# Restore
mongorestore --db simionic /var/backups/mongo/20240101/simionic/
```

Automate with a daily cron job:

```bash
# /etc/cron.d/mongodump
0 2 * * * root mongodump --db simionic --out /var/backups/mongo/$(date +%Y%m%d) && \
  find /var/backups/mongo -mtime +30 -type d -exec rm -rf {} +
```

---

## Security Checklist

Before going to production, verify the following:

**Network**
- [ ] MongoDB port 27017 is not accessible from the internet
- [ ] Only ports 80 and 443 are open to the internet
- [ ] Nginx is configured to reject requests with no `Host` header or unknown hostnames

**Application**
- [ ] `NEXTAUTH_SECRET` is a cryptographically random value of at least 32 bytes
- [ ] `NEXTAUTH_URL` is set to the correct production URL (HTTPS)
- [ ] `NODE_ENV=production` is set when running `next start`
- [ ] `.env.local` is readable only by the application process (`chmod 600`)
- [ ] `TRUST_PROXY=true` is set only if a trusted reverse proxy is in front of the app

**HTTPS**
- [ ] All HTTP traffic is redirected to HTTPS (done in Nginx config above)
- [ ] The SSL certificate is valid and auto-renewing
- [ ] HSTS header is set (done automatically by `next.config.ts`)

**MongoDB**
- [ ] MongoDB is bound to `127.0.0.1` only
- [ ] MongoDB authentication is enabled (strongly recommended)
- [ ] Regular backups are scheduled

**Email**
- [ ] `EMAIL_PROVIDER=smtp` and all `SMTP_*` variables are set in production
- [ ] Password reset emails are being delivered (test by requesting a reset)

---

## Rate Limiting Considerations

The application uses an **in-memory** sliding-window rate limiter (`src/lib/rate-limit.ts`). This has the following implications depending on your deployment:

### Single process (PM2 `instances: 1` or systemd)

Works correctly. One process, one rate-limit counter per IP. Set `TRUST_PROXY=true` so that per-IP limiting uses real client IPs rather than lumping all traffic into one bucket.

```
PM2 ecosystem.config.js:
  instances: 1    <- keep at 1
```

### Multiple processes (PM2 cluster mode, `instances: "max"`)

**Not recommended without modification.** Each Node.js worker has an independent counter. A client can bypass the limit by hitting different workers. With `N` workers, the effective limit is `N × configured_limit`.

If you need multiple processes for CPU throughput, replace the in-memory store with a shared Redis instance:

```typescript
// Conceptual replacement for src/lib/rate-limit.ts
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

export async function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const windowKey = `rl:${key}:${Math.floor(now / windowMs)}`;
  const count = await redis.incr(windowKey);
  if (count === 1) await redis.pexpire(windowKey, windowMs);
  return { success: count <= limit, remaining: Math.max(0, limit - count) };
}
```

### Vercel / serverless

Each function invocation is stateless. The in-memory counter resets with every cold start and is not shared. For production rate limiting on Vercel, use a Redis-backed implementation (e.g., [Upstash Redis](https://upstash.com/)).

---

## Maintenance and Updates

### Updating the application

```bash
cd /var/www/g1000profiles

# Pull latest code
git pull

# Install any new dependencies
npm ci --omit=dev

# Rebuild
npm run build

# Restart gracefully (PM2 performs a rolling restart with zero downtime)
pm2 reload g1000profiles

# Or, for systemd:
sudo systemctl restart g1000profiles
```

### Checking logs

```bash
# PM2
pm2 logs g1000profiles --lines 100

# Systemd
journalctl -u g1000profiles -f --since "1 hour ago"

# MongoDB
sudo journalctl -u mongod -f
```

### Monitoring

PM2 includes a basic process monitor:

```bash
pm2 monit
```

For more comprehensive monitoring, consider:
- [PM2 Plus](https://pm2.io/) — managed monitoring for PM2
- [Prometheus + Grafana](https://prometheus.io/) — open-source metrics stack
- Simple uptime monitoring: [UptimeRobot](https://uptimerobot.com/) (free tier)
