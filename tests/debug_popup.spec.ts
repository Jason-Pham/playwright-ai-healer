import { test, expect } from '@playwright/test';
import { GiganttiHandler } from '../src/utils/SiteHandler.js';
import { logger } from '../src/utils/Logger.js';

test.describe('Debug Popup Handling', () => {
    test('should dismiss cookie banner on WebKit/Mobile', async ({ page }) => {
        const handler = new GiganttiHandler();

        logger.info(`Starting test on ${test.info().project.name}`);
        // Go to home page
        await page.goto('https://www.gigantti.fi/');
        await page.waitForLoadState('domcontentloaded');

        // Attempt dismissal
        await handler.dismissOverlays(page);

        // Verify banner is gone
        const cookieBanner = page.locator('#coiPage-1 .coi-banner__accept').first();
        await expect(cookieBanner).toBeHidden({ timeout: 5000 });

        logger.info('Popup dismissed successfully (or was never present).');
    });
});
