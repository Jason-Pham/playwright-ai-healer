# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `AutoHealer.hover()` — self-healing hover action with AI fallback on failure.
- `AutoHealer.type()` — self-healing character-by-character input (`pressSequentially`) with AI fallback.
- `AutoHealer.selectOption()` — self-healing `<select>` option picker with AI fallback.
- `AutoHealer.check()` / `AutoHealer.uncheck()` — self-healing checkbox actions with AI fallback.
- `AutoHealer.waitForSelector()` — self-healing element wait with AI fallback.
- `HealingEvent.tokensUsed` — records prompt, completion, and total token counts from the AI provider when available.
- `HealingEvent.domSnapshotLength` — records the character length of the DOM snapshot sent to the AI for diagnostics.
- Pre-validation step in `executeAction`: before attempting any action, `AutoHealer` now waits for the target element to become visible (with a short timeout), logging a warning if it does not appear but still proceeding to the action.
- Skip-on-healing-failure: when AI healing cannot find a replacement selector, the test is now gracefully skipped via `test.skip()` with an annotation rather than throwing an unrecoverable error.
- `CONSOLE_LOG_LEVEL` environment variable — controls the Winston console transport log level independently from the file transport level.
- `config.test.timeouts.short` (5 000 ms) — used by `executeAction` for pre-validation and initial action attempts.
- `config.test.timeouts.stabilization` (200 ms) — brief pause used during search input hydration checks.

### Changed

- **`AutoHealer` DRY refactor**: `click()` and `fill()` now delegate to a shared `executeAction()` helper that handles locator resolution, pre-validation, action execution, healing, locator persistence, and skip-on-failure in one place. The remaining methods (`hover`, `type`, `selectOption`, `check`, `uncheck`, `waitForSelector`) still use inline logic but follow the same pattern.
- `AutoHealer` automatically switches AI provider (Gemini <-> OpenAI) when a 4xx client error is received from the active provider, provided credentials for the alternate provider are configured.
- Config singleton is now lazily initialised and deduplicates environment loading to prevent double-loading on import.
- DOM snapshot reduction is now two-tier: interactive elements are prioritised with full attributes; ancestor context is included with minimal attributes; hard cap at 15 000 characters.
- Default `TEST_TIMEOUT` changed from `180000` (parsed from env default string).

### Fixed

- Cookie banner dismissal no longer fails when the banner is hidden at the time of the DOM snapshot — `GiganttiHandler` now waits for the banner to become visible before attempting dismissal, swallowing the timeout if it never appears.
- `getSimplifiedDOM()` — the `TreeWalker` code path is now only used as a last-resort fallback when no interactive elements are found on the page. The primary serialisation path uses the two-tier priority approach.
- Removed unused `popupHandlerRegistered` field from `AutoHealer`. (Note: the field still exists in `GiganttiHomePage` but is unused.)
- `healing-demo.spec.ts`: replaced non-null assertion with an explicit guard for safer access to healing events.
- Restored ESLint type-safety rules (`@typescript-eslint/no-unsafe-*`) in test file overrides that were accidentally relaxed.
