# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Confidence threshold** — healed selectors are now verified against the live DOM before use; selectors matching zero elements are rejected (confidence below `config.ai.healing.confidenceThreshold`).
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

### Changed

- `AutoHealer` action methods (`hover`, `type`, `selectOption`, `check`, `uncheck`, `waitForSelector`) refactored to use a shared `executeAction` helper, eliminating duplicated healing/retry/skip logic.
- `AutoHealer` automatically switches AI provider (Gemini ↔ OpenAI) when a 4xx client error is received from the active provider, provided credentials for the alternate provider are configured.
- `BasePage.waitForPageLoad` now correctly honours the `networking` option; previously the `networkidle` wait was silently skipped regardless of the flag value.
- Config singleton is now lazily initialised and deduplicates environment loading to prevent double-loading on import.
- DOM snapshot reduction is now two-tier: interactive elements are prioritised with full attributes; ancestor context is included with minimal attributes; hard cap at 15 K characters.

### Fixed

- Cookie banner dismissal no longer fails when the banner is hidden at the time of the DOM snapshot — `GiganttiHandler` now waits for the banner to become visible before attempting dismissal, swallowing the timeout if it never appears.
- `LocatorManager.updateLocator` now rolls back the in-memory state if the disk write fails.
- Removed dead `TreeWalker` code path from `getSimplifiedDOM()`.
- Removed unused `popupHandlerRegistered` field from `AutoHealer`.
