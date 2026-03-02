# ── Stage 1: install deps with layer caching ─────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: full Playwright image with browsers ──────────────────────────────
ARG PW_VERSION=1.58.2
FROM mcr.microsoft.com/playwright:v${PW_VERSION}-noble AS runner
WORKDIR /app

# Copy installed node_modules from deps stage (avoids re-downloading browsers)
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY . .

# Default: run E2E tests in headless mode
CMD ["npx", "playwright", "test"]
