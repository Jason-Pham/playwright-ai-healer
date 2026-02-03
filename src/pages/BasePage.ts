import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { AutoHealer } from '../AutoHealer.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';

export abstract class BasePage {
    protected page: Page;
    protected autoHealer: AutoHealer;

    constructor(page: Page, autoHealer: AutoHealer) {
        this.page = page;
        this.autoHealer = autoHealer;
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
    async waitForPageLoad(options?: { timeout?: number, networking?: boolean }): Promise<void> {
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

        try {
            await this.page.waitForResponse(
                resp =>
                    resp.url().includes('policy.app.cookieinformation.com/cookie-data/gigantti.fi/cabl.json') &&
                    resp.status() === 200,
                { timeout: config.test.timeouts.default }
            );
        } catch {
            // Ignore timeout - likely already loaded or cached
        }

        await this.waitForPageLoad({ networking: true, timeout: config.test.timeouts.default });

        try {
            // Handle Gigantti cookie consent banner
            const cookieBtn = this.page
                .locator('button[aria-label="OK"], .coi-banner__accept, #coiPage-1 .coi-banner__accept')
                .first();

            if (await cookieBtn.isVisible({ timeout: config.test.timeouts.default }).catch(() => false)) {
                logger.debug('Dismissing cookie banner before action...');
                await cookieBtn.click({ force: true });

                // Wait for body.noScroll to be removed
                try {
                    await this.page.waitForFunction(() => !document.body.classList.contains('noScroll'), {
                        timeout: config.test.timeouts.default,
                    });
                } catch {
                    // Ignore - not all pages have noScroll
                }
            }
        } catch {
            // Ignore - overlays may not be present
        }
    }

    /**
     * Click an element after dismissing any overlays
     */
    async safeClick(locator: Locator, options?: { force?: boolean; timeout?: number }): Promise<void> {
        await this.dismissOverlaysBeforeAction();
        await locator.click(options);
    }

    /**
     * Fill an input after dismissing any overlays
     */
    async safeFill(locator: Locator, value: string): Promise<void> {
        await this.dismissOverlaysBeforeAction();
        await locator.fill(value, { force: true });
    }

    /**
     * Verify URL after dismissing any overlays and waiting for page load
     */
    async safeVerifyURL(pattern: RegExp, options?: { timeout?: number }): Promise<void> {
        await this.waitForPageLoad({ networking: true, timeout: config.test.timeouts.default });
        await this.dismissOverlaysBeforeAction();
        await expect(this.page).toHaveURL(pattern, options);
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
            await this.dismissOverlaysBeforeAction();
            await locator.waitFor(options);
        }

        return locator;
    }
}
