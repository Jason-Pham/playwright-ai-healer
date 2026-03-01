#!/bin/zsh

# Load nvm so the correct Node.js version is available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Load env vars from project .env
set -a
source /Users/admin/Workspace/github_personal/self-healing-agent/.env
set +a

LOG_DIR="$HOME/Library/Logs/self-healing-agent"
mkdir -p "$LOG_DIR"

REPO="/Users/admin/Workspace/github_personal/self-healing-agent"

send_email() {
  local subject="$1"
  local body="$2"

  curl --ssl-reqd --silent \
    --url 'smtps://smtp.gmail.com:465' \
    --user "${GMAIL_FROM}:${GMAIL_APP_PASSWORD}" \
    --mail-from "${GMAIL_FROM}" \
    --mail-rcpt "${GMAIL_TO}" \
    --upload-file - << EMAIL
From: Self-Healing Agent <${GMAIL_FROM}>
To: ${GMAIL_TO}
Subject: ${subject}
Content-Type: text/plain

${body}
EMAIL

  if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Email sent to ${GMAIL_TO}"
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: Failed to send email"
  fi
}

fail() {
  local step="$1"
  local output="$2"
  echo ""
  echo "=========================================="
  echo "FAILURE: ${step} at $(date '+%Y-%m-%d %H:%M:%S')"
  echo "=========================================="
  send_email \
    "[ALERT] CI FAILED: ${step} — $(date '+%Y-%m-%d %H:%M:%S')" \
    "Step '${step}' failed at $(date '+%Y-%m-%d %H:%M:%S').

--- Output ---
${output}"
  exit 1
}

cd "$REPO"

# ── Step 1: Sync main branch ──────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Step 1: Syncing main branch..."
echo "=========================================="
sync_output=$(git fetch origin main 2>&1 && git checkout main 2>&1 && git pull origin main 2>&1)
echo "$sync_output"
[ $? -ne 0 ] && fail "git sync main" "$sync_output"

# ── Step 2: Install dependencies ──────────────────────────────────────────────
echo ""
echo "=========================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Step 2: Installing dependencies..."
echo "=========================================="
install_output=$(npm ci 2>&1)
echo "$install_output"
[ $? -ne 0 ] && fail "npm ci" "$install_output"

# ── Step 3: Validate (typecheck + lint + format + unit tests) ─────────────────
echo ""
echo "=========================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Step 3: Running validate (typecheck, lint, format, unit tests)..."
echo "=========================================="
validate_output=$(npm run validate 2>&1)
echo "$validate_output"
[ $? -ne 0 ] && fail "npm run validate" "$validate_output"

# ── Step 4: Unit tests with coverage ──────────────────────────────────────────
echo ""
echo "=========================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Step 4: Running unit tests with coverage..."
echo "=========================================="
coverage_output=$(npm run test:coverage 2>&1)
echo "$coverage_output"
[ $? -ne 0 ] && fail "npm run test:coverage" "$coverage_output"

# ── Step 5: E2E tests — all browsers ──────────────────────────────────────────
echo ""
echo "=========================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Step 5: Running E2E tests (all browsers)..."
echo "=========================================="
e2e_output=$(npm run test:prod:all-browsers 2>&1)
echo "$e2e_output"
[ $? -ne 0 ] && fail "npm run test:prod:all-browsers" "$e2e_output"

echo ""
echo "=========================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] All CI steps passed."
echo "=========================================="
