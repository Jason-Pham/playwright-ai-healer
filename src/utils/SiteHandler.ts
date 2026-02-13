import type { Page, Locator } from '@playwright/test';
import { config } from '../config/index.js';
import { logger } from './Logger.js';

import locators from '../config/locators.json' with { type: 'json' };

export interface SiteHandler {
    dismissOverlays(page: Page): Promise<void>;
}

export class GiganttiHandler implements SiteHandler {
    async dismissOverlays(page: Page): Promise<void> {
        // Handle Gigantti cookie consent banner using CookieInformation SDK API.
        // The cookie button renders BEFORE its JS handlers are attached, so we
        // wait for the SDK to be ready, then use its API to dismiss the banner.
        const cookieBtn = page
            .locator(locators.gigantti.cookieBannerAccept)
            .first();

        try {
            // Wait for cookie banner to appear (it renders asynchronously after page load).
            // If it doesn't appear within the timeout, there's no banner to dismiss.
            await cookieBtn.waitFor({ state: 'visible', timeout: config.test.timeouts.cookie });
        } catch {
            // Banner didn't appear — nothing to dismiss
            return;
        }

        try {
            // Wait for CookieInformation SDK to be fully initialized.
            // This replaces the old waitForResponse(cabl.json) which had a race
            // condition: if the response arrived before the listener was set up,
            // it would needlessly wait for the full timeout duration.
            await page.waitForFunction(
                () => (window as any).isCookieInformationAPIReady === true,
                { timeout: config.test.timeouts.cookie }
            ).catch(() => {
                // SDK not ready in time — proceed to fallback click
            });

            logger.debug('Dismissing Gigantti cookie banner...');

            // Use SDK API to accept all cookies; fall back to direct click
            await page.evaluate(() => {
                const ci = (window as any).CookieInformation;
                if (typeof ci?.submitAllCategories === 'function') {
                    ci.submitAllCategories();
                } else {
                    const btn =
                        document.querySelector<HTMLElement>('button[aria-label="OK"]') ??
                        document.querySelector<HTMLElement>('.coi-banner__accept');
                    btn?.click();
                }
            });

            // Wait for the banner to disappear
            await cookieBtn.waitFor({ state: 'hidden', timeout: config.test.timeouts.cookie }).catch(() => {
                // Ignore
            });
        } catch {
            // Ignore
        }
    }
}

export class NoOpHandler implements SiteHandler {
    async dismissOverlays(page: Page): Promise<void> {
        // Do nothing
    }
}
