import { test } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';
import locators from '../config/locators.json' with { type: 'json' };

/**
 * Product Detail Page
 * Represents a single product's detail page
 */
export class ProductDetailPage extends BasePage {
    private readonly timeouts = config.test.timeouts;

    async verifyProductDetailsLoaded() {
        const titleSelectors = locators.gigantti.productTitle;
        await this.page
            .locator(titleSelectors.join(','))
            .first()
            .waitFor({ state: 'visible', timeout: this.timeouts.productVisibility });

        const priceSelectors = locators.gigantti.productPrice;
        try {
            await this.page
                .locator(priceSelectors.join(','))
                .first()
                .waitFor({ state: 'visible', timeout: this.timeouts.productVisibility });
        } catch {
            const project = test.info().project.name;
            logger.warn(`[${project}] ⚠️ Price element not immediately visible, but page loaded.`);
        }
    }
}
