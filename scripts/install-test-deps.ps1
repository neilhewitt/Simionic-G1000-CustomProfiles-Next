# install-test-deps.ps1
# ---------------------------------------------------------------------------
# Installs all dependencies required to run the Simionic G1000 Custom Profiles
# integration and UI test suite on a local Windows machine.
#
# Usage (from the repository root in PowerShell or the VS Code Terminal):
#   .\scripts\install-test-deps.ps1
#
# If the script is blocked by PowerShell's execution policy, run:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-test-deps.ps1
#
# Or from within Visual Studio Code:
#   Open the integrated terminal (Ctrl+`) and run the command above.
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

$ErrorActionPreference = "Stop"

function Write-Info    { param($msg) Write-Host "[info]  $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "[ok]    $msg" -ForegroundColor Green }
function Write-Warn    { param($msg) Write-Host "[warn]  $msg" -ForegroundColor Yellow }
function Write-Err     { param($msg) Write-Host "[error] $msg" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 1. Node.js version check
# ---------------------------------------------------------------------------
Write-Info "Checking Node.js version..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js is not installed. Please install Node.js >= 18 from https://nodejs.org"
    exit 1
}

$nodeVersionRaw = (node --version).TrimStart("v")
$nodeMajor = [int]($nodeVersionRaw.Split(".")[0])

if ($nodeMajor -lt 18) {
    Write-Err "Node.js >= 18 is required (found v$nodeVersionRaw). Please upgrade."
    exit 1
}

Write-Success "Node.js v$nodeVersionRaw detected."

# ---------------------------------------------------------------------------
# 2. npm install
# ---------------------------------------------------------------------------
Write-Info "Installing npm dependencies..."
npm install
if ($LASTEXITCODE -ne 0) { Write-Err "npm install failed."; exit 1 }
Write-Success "npm install complete."

# ---------------------------------------------------------------------------
# 3. Playwright browser installation
# ---------------------------------------------------------------------------
Write-Info "Installing Playwright browser binaries (Chromium)..."
npx playwright install chromium
if ($LASTEXITCODE -ne 0) { Write-Err "Playwright browser installation failed."; exit 1 }
Write-Success "Playwright browser installation complete."

# ---------------------------------------------------------------------------
# 4. .env.local setup
# ---------------------------------------------------------------------------
$envFile = ".env.local"

if (Test-Path $envFile) {
    Write-Warn ".env.local already exists — skipping creation. Ensure it contains the"
    Write-Warn "variables listed in .env.local.example (or the README) for tests to work."
} else {
    Write-Info "Creating $envFile with placeholder values for local testing..."

    @'
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
'@ | Set-Content $envFile -Encoding UTF8

    Write-Success "$envFile created with placeholder values."
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Setup complete! You can now run the tests:" -ForegroundColor White
Write-Host ""
Write-Host "  Integration tests (no database required):"
Write-Host "    npm run test:integration" -ForegroundColor Cyan
Write-Host ""
Write-Host "  UI / end-to-end tests (starts Next.js dev server automatically):"
Write-Host "    npm run test:ui" -ForegroundColor Cyan
Write-Host ""
Write-Host "  All tests:"
Write-Host "    npm test" -ForegroundColor Cyan
Write-Host ""
