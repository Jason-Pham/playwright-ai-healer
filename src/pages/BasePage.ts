import type { Page, Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { AutoHealer } from '../AutoHealer.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';
import { type SiteHandler, GiganttiHandler } from '../utils/SiteHandler.js';

/**
 * BasePage - Abstract base class for all page objects.
 *
 * Provides overlay dismissal (cookie banners, security challenges), self-healing
 * interaction wrappers, and Vercel security challenge detection. Extend this class
 * for every page object and use `safeClick()` / `safeFill()` rather than calling
 * Playwright directly so interactions automatically benefit from healing.
 *
 * @example
 * ```typescript
 * class SearchPage extends BasePage {
 *   async search(term: string) {
 *     await this.safeClick('gigantti.searchInput');
 *     await this.safeFill('gigantti.searchInput', term);
 *   }
 * }
 * ```
 */
export abstract class BasePage {
    /** Playwright page instance for direct access when needed. */
    public page: Page;
    /** AutoHealer instance used for self-healing interactions. `undefined` when running without AI. */
    public autoHealer: AutoHealer | undefined;
    protected siteHandler: SiteHandler;

    private securityChallengeFailed = false;

    /**
     * @param page - Playwright page instance.
     * @param autoHealer - Optional AutoHealer for self-healing. Omit to use plain Playwright.
     * @param siteHandler - Site-specific overlay handler. Defaults to `GiganttiHandler`.
     */
    constructor(page: Page, autoHealer?: AutoHealer, siteHandler: SiteHandler = new GiganttiHandler()) {
        this.page = page;
        this.autoHealer = autoHealer;
        this.siteHandler = siteHandler;

        // Monitor for Vercel security challenge failures
        this.page.on('response', response => {
            if (
                config.ai.security?.vercelChallengePath &&
                response.url().includes(config.ai.security.vercelChallengePath)
            ) {
                const status = response.status();
                if (status >= 400) {
                    logger.warn(`Vercel security challenge failed with status ${status}`);
                    this.securityChallengeFailed = true;
                }
            }
        });
    }

    /**
     * Navigate to the given URL.
     *
     * @param url - Absolute URL to navigate to.
     */
    async goto(url: string) {
        await this.page.goto(url);
    }

    /**
     * Pause execution for a fixed duration.
     *
     * @param ms - Duration to wait in milliseconds.
     */
    async wait(ms: number) {
        await this.page.waitForTimeout(ms);
    }

    /**
     * Wait for the page to reach `load` and `domcontentloaded` states.
     *
     * @param options.timeout - Maximum wait time in milliseconds.
     * @param options.networking - When `true`, also waits for `networkidle` after load states.
     */
    async waitForPageLoad(options?: { timeout?: number; networking?: boolean }): Promise<void> {
        const { timeout, networking } = options ?? {};
        const pwOptions = timeout !== undefined ? { timeout } : undefined;
        await this.page.waitForLoadState('load', pwOptions);
        await this.page.waitForLoadState('domcontentloaded', pwOptions);
        if (networking) {
            // networkidle can fail on pages with continuous polling; treat as best-effort
            await this.page.waitForLoadState('networkidle', pwOptions).catch(() => {
                logger.debug('[BasePage] networkidle timed out; proceeding without full network quiesce');
            });
        }
    }

    private overlaysDismissed = false;

    protected skipTest(reason: string): void {
        test.skip(true, reason);
    }

    protected checkSecurityChallenge(): void {
        if (this.securityChallengeFailed) {
            logger.warn('Skipping test due to failed security challenge.');
            this.skipTest('Aborting test due to Vercel security challenge failure');
        }
    }

    protected async dismissOverlaysBeforeAction(): Promise<void> {
        this.checkSecurityChallenge();
        await this.waitForPageLoad({ networking: true, timeout: config.test.timeouts.default });
        await this.siteHandler.dismissOverlays(this.page);
        this.overlaysDismissed = true;
    }

    private async ensureOverlaysDismissed(): Promise<void> {
        if (!this.overlaysDismissed) {
            await this.dismissOverlaysBeforeAction();
            this.overlaysDismissed = true;
        }
    }

    /**
     * Click an element, dismissing overlays first and delegating to `AutoHealer` when available.
     *
     * Accepts a dot-notation locator key (e.g. `gigantti.searchInput`) or a raw CSS selector.
     * When a string selector is provided and `autoHealer` is configured, healing is attempted
     * automatically on failure. When a `Locator` object is provided, it is clicked directly.
     *
     * @param selectorOrLocator - Dot-notation locator key, CSS selector, or Playwright `Locator`.
     * @param options.force - Bypass actionability checks.
     * @param options.timeout - Maximum time in milliseconds to wait for the element.
     */
    async safeClick(
        selectorOrLocator: string | Locator,
        options?: { force?: boolean; timeout?: number }
    ): Promise<void> {
        await this.ensureOverlaysDismissed();
        if (typeof selectorOrLocator === 'string') {
            if (this.autoHealer) {
                await this.autoHealer.click(selectorOrLocator, options);
            } else {
                await this.page.click(selectorOrLocator, options);
            }
        } else {
            await selectorOrLocator.click(options);
        }
    }

    /**
     * Fill an input element, dismissing overlays first and delegating to `AutoHealer` when available.
     *
     * When a string selector is provided and `autoHealer` is configured, healing is attempted
     * automatically on failure. When a `Locator` object is provided, the fill is retried with
     * `toPass` to handle transient focus/clear timing issues.
     *
     * @param selectorOrLocator - Dot-notation locator key, CSS selector, or Playwright `Locator`.
     * @param value - Text value to fill into the element.
     * @param options.force - Bypass actionability checks.
     * @param options.timeout - Maximum time in milliseconds for the overall fill operation.
     */
    async safeFill(
        selectorOrLocator: string | Locator,
        value: string,
        options?: { force?: boolean; timeout?: number }
    ): Promise<void> {
        await this.ensureOverlaysDismissed();

        if (typeof selectorOrLocator === 'string') {
            if (this.autoHealer) {
                await this.autoHealer.fill(selectorOrLocator, value, options);
                return;
            } else {
                await this.page.fill(selectorOrLocator, value, options);
                return;
            }
        }

        const timeout = options?.timeout ?? config.test.timeouts.default;

        await expect(async () => {
            await selectorOrLocator.focus({ timeout: config.test.timeouts.short }).catch(() => {});
            await selectorOrLocator.clear({ timeout: config.test.timeouts.short }).catch(() => {});

            await selectorOrLocator.fill(value, {
                force: true,
                timeout: config.test.timeouts.short,
                ...options,
            });

            await expect(selectorOrLocator).toHaveValue(value, { timeout: config.test.timeouts.short });
        }).toPass({ timeout });
    }

    /**
     * Verify URL after dismissing any overlays and waiting for page load
     */
    async safeVerifyURL(pattern: RegExp, options?: { timeout?: number }): Promise<void> {
        await this.ensureOverlaysDismissed();
        await expect(this.page).toHaveURL(pattern, options);
    }

    /**
     * Verify input value after waiting for page load
     */
    async expectValue(locator: Locator, value: string): Promise<void> {
        await this.waitForPageLoad({ networking: true, timeout: config.test.timeouts.default });
        await expect(locator).toHaveValue(value);
    }

    /**
     * Find first matching element from multiple selectors
     * @param selectors Array of CSS selectors to try
     * @param options Optional waitFor options
     * @returns Locator for the first matching element
     */
    async findFirstElement(
        selectors: string[],
        options?: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number }
    ): Promise<Locator> {
        await this.waitForPageLoad({ networking: true, timeout: config.test.timeouts.default });
        const combinedSelector = selectors.join(',');
        const locator = this.page.locator(combinedSelector).first();

        if (options) {
            await locator.waitFor(options);
        }

        return locator;
    }
}
