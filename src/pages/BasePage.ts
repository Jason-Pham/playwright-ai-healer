import type { Page, Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { AutoHealer } from '../AutoHealer.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';
import { type SiteHandler, GiganttiHandler } from '../utils/SiteHandler.js';

export abstract class BasePage {
    public page: Page;
    public autoHealer: AutoHealer | undefined;
    protected siteHandler: SiteHandler;

    private securityChallengeFailed = false;

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

    async goto(url: string) {
        await this.page.goto(url);
    }

    async wait(ms: number) {
        await this.page.waitForTimeout(ms);
    }

    async waitForPageLoad(options?: { timeout?: number; networking?: boolean }): Promise<void> {
        await this.page.waitForLoadState('load', options);
        await this.page.waitForLoadState('domcontentloaded', options);
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
