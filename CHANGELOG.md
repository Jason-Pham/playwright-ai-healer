# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Refactored

- `AutoHealer.ts` split into four focused modules under `src/ai/`:
    - `AIClientManager` — owns AI client lifecycle, API key rotation, provider failover, and raw `makeRequest()` calls with timeout wrapping
    - `DOMSerializer` — `getSimplifiedDOM(page)` that captures a focused interactive-element snapshot for the AI prompt
    - `ResponseParser` — `parseAIResponse()` that strips markdown fences, backticks, and surrounding quotes from raw AI responses
    - `src/ai/index.ts` — barrel re-export for the `ai/` sub-package
- `AutoHealer.ts` shrinks from 891 → 512 lines; public API and healing control flow are unchanged.

### Added

- **`CategoryMenuPage`** — new page object (`src/pages/CategoryMenuPage.ts`) for typed category navigation; `select<K extends CategoryKey>(key, subcategoryKey?)` navigates to a top-level category and optionally drills into a subcategory tile, reusing the XPath + `getByRole` fallback strategy from `GiganttiHomePage`.
- **Typed category system** — `categoriesData` const in `src/config/index.ts` defines 7 top-level categories (`computers`, `phones`, `tablets`, `tvs`, `gaming`, `cameras`, `appliances`) each with their Finnish nav label and available subcategory tiles. Exports `CategoryKey` and `SubCategoryKey<K>` types for compile-time validation — invalid keys are caught by TypeScript.
- **`GiganttiHomePage.selectCategory<K>(key, subcategoryKey?)`** — typed shortcut delegating to `CategoryMenuPage`; replaces ad-hoc `navigateToCategory(string)` calls in tests (`navigateToCategory` is retained for backward compatibility).
- **`categoryTile` locator** (`src/config/locators.json`) — `main article li a:has(img)` selector used as fallback in `CategoryPage.verifyProductsDisplayed()` for category landing pages (which show subcategory tiles rather than `[data-testid="product-card"]` grids).
- **Category and subcategory E2E tests** — `tests/gigantti.spec.ts` extended with 5 top-level category navigation tests (loop over `computers`, `phones`, `tvs`, `gaming`, `appliances`) and 7 subcategory navigation tests (`computers → allComputers/components`, `tvs → headphones`, `gaming → consoles/games`, `appliances → refrigerators/washingMachines`).
- Nav link fallback in `CategoryMenuPage._navigateByLabel` scoped to `a:not([data-testid="product-card"])` to prevent matching product card links when searching for navigation anchors.

- Multi-stage `Dockerfile` (`deps` → `runner`) reduces rebuild time by caching the `npm ci` layer separately from the Playwright image layer.
- `docker-compose.yml` now exposes two named services: `unit-tests` (runs `npm run validate`) and `e2e-tests` (runs `npm run test:prod`, mounts `playwright-report/`, `test-results/`, and `logs/` as host volumes).
- **Confidence threshold** — healed selectors are now verified against the live DOM before use; selectors matching zero elements are rejected (confidence below `config.ai.healing.confidenceThreshold`). Scoring is currently binary (0.0 or 1.0) with a TODO to extend to continuous scoring.
- Unit test covering the confidence-threshold rejection path (healed selector passes validation but matches 0 DOM elements).
- **Selector validation** — AI-returned selectors are checked against an allowlist of safe patterns (CSS, XPath, Playwright text engines) and a denylist of dangerous payloads (`javascript:`, `<script>`, `eval(`, etc.) before being used or persisted.
- `HoverOptions`, `TypeOptions`, `SelectOptionOptions`, `SelectOptionValues`, `CheckOptions`, `WaitForSelectorOptions` — dedicated option types in `src/types.ts` replacing inline type literals.
- `AutoHealer.hover()` — self-healing hover action with AI fallback on failure.
- `AutoHealer.type()` — self-healing character-by-character input (`pressSequentially`) with AI fallback.
- `AutoHealer.selectOption()` — self-healing `<select>` option picker with AI fallback.
- `AutoHealer.check()` / `AutoHealer.uncheck()` — self-healing checkbox actions with AI fallback.
- `AutoHealer.waitForSelector()` — self-healing element wait with AI fallback.
- `HealingEvent.tokensUsed` — records prompt, completion, and total token counts from the AI provider when available.
- `HealingEvent.domSnapshotLength` — records the character length of the DOM snapshot sent to the AI for diagnostics.
- DOM snapshot char limit is now configurable via the `DOM_SNAPSHOT_CHAR_LIMIT` environment variable.
- `AutoHealer.healAll(operations)` — batch-heals multiple failing selectors; AI requests for all failures fire in parallel (`Promise.allSettled`) while Playwright page interactions remain sequential. Returns `HealAllResult[]` with per-operation outcome.
- `HealOperation` and `HealAllResult` types added to `src/types.ts`.
- **Selector stability metrics** — `LocatorManager` now tracks per-key failure and heal events in `src/config/metrics.json`. New methods: `recordSelectorFailure(key)`, `recordSelectorHealed(key)`, `getMetrics(key?)`. `AutoHealer` wires these automatically on every healing cycle.
- `SelectorMetrics` and `MetricsStore` types added to `src/types.ts`.
- **Pluggable locator storage** — `src/utils/LocatorAdapter.ts` introduces a `LocatorAdapter` interface with two implementations: `FileAdapter` (JSON + file-locking, default) and `SQLiteAdapter` (ACID SQLite via `better-sqlite3`). Select the backend with `LOCATOR_STORE=file|sqlite`.
- `LocatorManager` is now a thin facade delegating all I/O to the active `LocatorAdapter`; public API (`getLocator`, `updateLocator`, `getAllLocators`) is unchanged.
- `LocatorManager.resetInstance()` — static method to clear the singleton for clean unit-test isolation.

### Changed

- `AutoHealer` action methods (`hover`, `type`, `selectOption`, `check`, `uncheck`, `waitForSelector`) refactored to use a shared `executeAction` helper, eliminating duplicated healing/retry/skip logic.
- `AutoHealer` automatically switches AI provider (Gemini ↔ OpenAI) when a 4xx client error is received from the active provider, provided credentials for the alternate provider are configured.
- `BasePage.waitForPageLoad` now correctly honours the `networking` option; previously the `networkidle` wait was silently skipped regardless of the flag value.
- Config singleton is now lazily initialised and deduplicates environment loading to prevent double-loading on import.
- DOM snapshot reduction is now two-tier: interactive elements are prioritised with full attributes; ancestor context is included with minimal attributes; hard cap at 15 K characters.

### Fixed

- **AbortController for API timeouts** — `withTimeout` now creates an `AbortController` and passes its signal to the AI provider HTTP call; when the timeout fires, the underlying network request is properly cancelled instead of being left to run in the background.
- Removed redundant `count()` check from `executeAction()` — `heal()` is now the single authority for DOM element verification; the duplicate check in `executeAction()` produced a confusing `"healed selector validation failed"` message instead of the canonical `"HEALING REJECTED"` from `heal()`.
- Reverted `executeAction()` visibility pre-check timeout from `config.test.timeouts.default` (60 s) back to `config.test.timeouts.short` (5 s) — a non-blocking pre-check should not delay test execution by up to 60 seconds on timeout.
- Cookie banner dismissal no longer fails when the banner is hidden at the time of the DOM snapshot — `GiganttiHandler` now waits for the banner to become visible before attempting dismissal, swallowing the timeout if it never appears.
- `LocatorManager.updateLocator` now rolls back the in-memory state if the disk write fails.
- `LocatorManager.updateLocator` now re-throws errors instead of silently swallowing them, allowing callers (e.g. `AutoHealer.executeAction`) to handle persistence failures.
- Updated `updateLocator` test mocks to return `Promise<void>` (`.mockResolvedValue(undefined)`) to match the real async signature.
- Removed dead `TreeWalker` code path from `getSimplifiedDOM()`.
- Removed unused `popupHandlerRegistered` field from `AutoHealer`.
- `SiteHandler` unit test coverage raised from 22 % to 84 % — all overlay-dismissal paths, force-hide branches, and the `NoOpHandler` are now covered.
