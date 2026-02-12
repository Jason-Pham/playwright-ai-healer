import type { Page, Locator } from '@playwright/test';
import { config } from '../config/index.js';
import { logger } from './Logger.js';

export interface SiteHandler {
    dismissOverlays(page: Page): Promise<void>;
}

export class GiganttiHandler implements SiteHandler {
    async dismissOverlays(page: Page): Promise<void> {
        // Handle Gigantti cookie consent banner
        try {
            await page.waitForResponse(
                resp =>
                    resp.url().includes('policy.app.cookieinformation.com/cookie-data/gigantti.fi/cabl.json') &&
                    resp.status() === 200,
                { timeout: config.test.timeouts.default }
            );
        } catch {
            // Ignore timeout
        }

        try {
            const cookieBtn = page
                .locator('button[aria-label="OK"], .coi-banner__accept, #coiPage-1 .coi-banner__accept')
                .first();

            if (await cookieBtn.isVisible({ timeout: config.test.timeouts.default }).catch(() => false)) {
                logger.debug('Dismissing Gigantti cookie banner...');
                await cookieBtn.click({ force: true });

                try {
                    await page.waitForFunction(() => !document.body.classList.contains('noScroll'), {
                        timeout: config.test.timeouts.default,
                    });
                } catch {
                    // Ignore
                }
            }
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
