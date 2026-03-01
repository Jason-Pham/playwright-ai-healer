# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (required after cloning)
npm install
npx playwright install --with-deps   # For E2E tests

# Validation pipeline (run before every PR)
npm run validate                      # typecheck → lint → format:check → test:unit

# Individual checks
npm run typecheck                     # TypeScript type checking (no emit)
npm run lint                          # ESLint check
npm run lint:fix                      # ESLint auto-fix
npm run format:check                  # Prettier check
npm run format                        # Prettier auto-format

# Unit tests (Vitest, ~1s)
npm run test:unit                     # Run once
npm run test:unit:watch               # Watch mode
npm run test:coverage                 # With coverage report

# Run a single unit test file
npx vitest run src/utils/LocatorManager.test.ts

# E2E tests (require GEMINI_API_KEY or OPENAI_API_KEY)
npm run test:prod                     # Headless, Desktop Chrome
npm run test:dev                      # Headed, debug logging
npm run test:healing-demo             # Self-healing demo
npm run test:prod:all-browsers        # All 9 browser configs
npm run test:debug                    # Headed with debug logs (Chromium)

# View Playwright HTML report
npx playwright show-report playwright-report
```

## Architecture

This is a **self-healing Playwright test automation framework**. When a selector-based interaction fails, `AutoHealer` intercepts the error, captures a simplified DOM snapshot, asks an AI provider (Gemini or OpenAI) for a replacement selector, and retries the action. Successfully healed selectors are persisted to `src/config/locators.json` for future runs.

### Core Data Flow

```
Test → BasePage.safeClick/safeFill
     → AutoHealer.click/fill
     → page.click(selector)  ← if fails →
     → getSimplifiedDOM() → AI provider (Gemini/OpenAI)
     → AI returns new selector
     → retry action with new selector
     → LocatorManager.updateLocator() persists new selector
```

### Key Files

| File | Role |
|------|------|
| `src/AutoHealer.ts` | Core healing logic: wraps Playwright actions, queries AI, handles retries/key rotation, records `HealingEvent[]` |
| `src/config/index.ts` | Centralized config validated with Zod; exports `config` object; loads `.env.{TEST_ENV}` via `Environment.ts` |
| `src/config/locators.json` | Persistent selector store; updated at runtime by `LocatorManager` when healing succeeds |
| `src/utils/LocatorManager.ts` | Singleton; reads/writes `locators.json` with file locking (`proper-lockfile`); dot-path key access (e.g., `gigantti.searchInput`) |
| `src/utils/SiteHandler.ts` | Strategy pattern for site-specific overlay dismissal; `GiganttiHandler` handles cookie banners; `NoOpHandler` is a no-op |
| `src/pages/BasePage.ts` | Abstract base for all page objects; wraps interactions with overlay dismissal, `AutoHealer` delegation, and Vercel security challenge detection |
| `tests/fixtures/base.ts` | Playwright fixtures providing `autoHealer` and `giganttiPage` to E2E tests |

### Environment Configuration

Environment is selected by `TEST_ENV` variable (`dev`/`staging`/`prod`). The config loads `.env.{TEST_ENV}` first, then `.env` overrides. Required env vars are validated with Zod at startup:

- `AI_PROVIDER=gemini|openai` (default: `gemini`)
- `GEMINI_API_KEY` — required if provider is `gemini`
- `OPENAI_API_KEY` / `OPENAI_API_KEYS` (comma-separated for rotation) — required if provider is `openai`
- `BASE_URL`, `LOG_LEVEL`, `HEADLESS`, `TEST_TIMEOUT`

### TypeScript Conventions

- **ES Modules**: `"type": "module"` in `package.json`; all imports must include `.js` extension (e.g., `from './AutoHealer.js'`)
- **Bracket notation** for env access: `process.env['VAR_NAME']`
- **Strict mode** enabled; avoid `any` in non-test code
- **Prettier**: 4-space indent, single quotes, no trailing commas

### Test Layout

- **Unit tests** (`src/**/*.test.ts`, `tests/unit/**`) — Vitest, co-located with source
- **E2E tests** (`tests/*.spec.ts`) — Playwright, excluded from Vitest via `vitest.config.ts`
- Unit tests use `src/test-setup.ts` for global mocks (e.g., `LocatorManager`, `winston`)
- E2E tests import from `tests/fixtures/base.ts` (not `@playwright/test` directly)

### Adding a New Page Object

1. Extend `BasePage` in `src/pages/`
2. Use `this.safeClick()` / `this.safeFill()` for interactions (delegates to `AutoHealer` if available)
3. Add selectors to `src/config/locators.json` with dot-path keys
4. Access via `LocatorManager.getInstance().getLocator('page.elementKey')`

### CI

GitHub Actions (`.github/workflows/playwright.yml`) runs on push/PR to `main`:
1. Unit tests with coverage
2. E2E tests across all 9 browser projects (matrix)
3. Uploads HTML reports as artifacts
Uses `npm ci` (not `npm install`) and requires `GEMINI_API_KEY` secret.

## Agents

**Start with `lead` for any task** — it decomposes the request, delegates to the right specialists, and synthesises the results.

| Agent | Task |
|-------|------|
| `lead` | Single entry point — orchestrates all other agents |
| `code-reviewer` | Review a PR, diff, or changed files for correctness, type safety, and design |
| `test-writer` | Write or expand unit/integration/E2E tests for a source file |
| `doc-generator` | Add JSDoc comments, README sections, or type documentation |
| `fullstack-developer` | Build a complete feature across library, page objects, config, and tests |
| `qa-expert` | Analyse test coverage gaps, identify flaky tests, recommend QA improvements |
