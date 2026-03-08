#!/usr/bin/env bash
# install-test-deps.sh
# ---------------------------------------------------------------------------
# Installs all dependencies required to run the Simionic G1000 Custom Profiles
# integration and UI test suite on a local machine.
#
# Usage (from the repository root):
#   bash scripts/install-test-deps.sh
#
# Or from within Visual Studio Code:
#   Open the integrated terminal (Ctrl+` / Cmd+`) and run the command above,
#   or use the VS Code Tasks panel (Terminal → Run Task) if .vscode/tasks.json
#   is present.
#
# What this script does:
#   1. Checks that Node.js >= 18 is installed.
#   2. Runs `npm install` to install all project dependencies including
#      @playwright/test.
#   3. Runs `npx playwright install chromium` to download the Chromium browser
#      binary used by the Playwright UI tests.
#   4. Creates a .env.local file (if one does not already exist) with the
#      minimum required environment variables for running tests locally.
# ---------------------------------------------------------------------------
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Colour

info()    { echo -e "${BOLD}[info]${NC}  $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*"; }

# ---------------------------------------------------------------------------
# 1. Node.js version check
# ---------------------------------------------------------------------------
info "Checking Node.js version..."
if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Please install Node.js >= 18 from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  error "Node.js >= 18 is required (found v${NODE_VERSION}.x). Please upgrade."
  exit 1
fi
success "Node.js $(node --version) detected."

# ---------------------------------------------------------------------------
# 2. npm install
# ---------------------------------------------------------------------------
info "Installing npm dependencies..."
npm install
success "npm install complete."

# ---------------------------------------------------------------------------
# 3. Playwright browser installation
# ---------------------------------------------------------------------------
info "Installing Playwright browser binaries (Chromium)..."
npx playwright install chromium
success "Playwright browser installation complete."

# ---------------------------------------------------------------------------
# 4. .env.local setup
# ---------------------------------------------------------------------------
ENV_FILE=".env.local"
if [ -f "$ENV_FILE" ]; then
  warn ".env.local already exists — skipping creation. Ensure it contains the"
  warn "variables listed in .env.local.example (or the README) for tests to work."
else
  info "Creating $ENV_FILE with placeholder values for local testing..."
  cat > "$ENV_FILE" <<'ENVTEMPLATE'
# ---------------------------------------------------------------------------
# .env.local — local development / test environment variables
# ---------------------------------------------------------------------------
# Copy this file and fill in real values for your own environment.
# The values below are sufficient to run the integration and UI tests locally
# (integration tests mock all external I/O; UI tests mock all API calls).
# ---------------------------------------------------------------------------

# NextAuth — REQUIRED even for tests (must be a non-empty string).
# Generate a secure random value for production: openssl rand -base64 32
NEXTAUTH_SECRET=local-dev-secret-change-me-in-production
NEXTAUTH_URL=http://localhost:3000

# MongoDB — replace with your local or Atlas connection string.
# The integration tests mock all DB calls, so this only needs to be reachable
# if you run tests that hit the real database.
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=simionic-dev

# Email (optional — defaults to the console logger in development).
# Set EMAIL_PROVIDER=smtp and the SMTP_* variables to send real emails.
# EMAIL_PROVIDER=smtp
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=user@example.com
# SMTP_PASS=your-password
# SMTP_FROM=noreply@example.com

# Rate limiting — set TRUST_PROXY=true only if your server sits behind a
# trusted reverse proxy that sets the x-forwarded-for header reliably.
# TRUST_PROXY=true
ENVTEMPLATE
  success "$ENV_FILE created with placeholder values."
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}Setup complete!${NC} You can now run the tests:"
echo ""
echo "  Integration tests (no database required):"
echo "    npm run test:integration"
echo ""
echo "  UI / end-to-end tests (starts Next.js dev server automatically):"
echo "    npm run test:ui"
echo ""
echo "  All tests:"
echo "    npm test"
echo ""
