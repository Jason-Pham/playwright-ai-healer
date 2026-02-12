import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { AutoHealer } from '../AutoHealer.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';
import { type SiteHandler, GiganttiHandler } from '../utils/SiteHandler.js';

export abstract class BasePage {
    protected page: Page;
    protected autoHealer: AutoHealer;
    protected siteHandler: SiteHandler;

    constructor(page: Page, autoHealer: AutoHealer, siteHandler: SiteHandler = new GiganttiHandler()) {
        this.page = page;
        this.autoHealer = autoHealer;
        this.siteHandler = siteHandler;
    }

    async goto(url: string) {
        await this.page.goto(url);
    }

    async wait(ms: number) {
        await this.page.waitForTimeout(ms);
    }

    /**
     * Wait for page to be fully loaded.
     * Consolidates waiting for domcontentloaded and potentially other states.
     */
    async waitForPageLoad(options?: { timeout?: number; networking?: boolean }): Promise<void> {
        await this.page.waitForLoadState('load', options);
        await this.page.waitForLoadState('domcontentloaded', options);
    }

    private hasWaitedForCookiePolicy = false;

    /**
     * Dismiss cookie/marketing overlays before performing action
     * Default implementation handles Gigantti cookie banners
     * Override this in subclasses for site-specific handling
     */
    protected async dismissOverlaysBeforeAction(): Promise<void> {
        await this.waitForPageLoad({ networking: true, timeout: config.test.timeouts.default });
        await this.siteHandler.dismissOverlays(this.page);
    }

    /**
     * Click an element after dismissing any overlays
     */
    async safeClick(locator: Locator, options?: { force?: boolean; timeout?: number }): Promise<void> {
        await locator.click(options);
    }

    /**
     * Fill an input with reliable retry logic:
     * 1. Dismiss overlays
     * 2. Attempt: Focus -> Clear -> Fill -> Verify Value
     * 3. Retry on failure
     */
    async safeFill(locator: Locator, value: string, options?: { force?: boolean; timeout?: number }): Promise<void> {
        await this.dismissOverlaysBeforeAction();
        const timeout = options?.timeout ?? config.test.timeouts.default;

        await expect(async () => {
            // Short timeouts for internal steps to allow faster retries
            // but ensure we give enough time for the action itself
            await locator.focus({ timeout: config.test.timeouts.short }).catch(() => { });
            await locator.clear({ timeout: config.test.timeouts.short }).catch(() => { });

            await locator.fill(value, {
                force: true,
                timeout: config.test.timeouts.short,
                ...options,
            });

            await expect(locator).toHaveValue(value, { timeout: config.test.timeouts.short });
        }).toPass({ timeout });
    }

    /**
     * Verify URL after dismissing any overlays and waiting for page load
     */
    async safeVerifyURL(pattern: RegExp, options?: { timeout?: number }): Promise<void> {
        await this.dismissOverlaysBeforeAction();
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
