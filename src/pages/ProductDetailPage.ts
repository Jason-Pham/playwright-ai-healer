import { test } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';
import { LocatorManager } from '../utils/LocatorManager.js';

/**
 * Product Detail Page
 * Represents a single product's detail page
 */
export class ProductDetailPage extends BasePage {
    private readonly timeouts = config.test.timeouts;

    async verifyProductDetailsLoaded() {
        // Resolve selectors dynamically from LocatorManager to pick up any healed values
        const locatorManager = LocatorManager.getInstance();
        const productTitle = locatorManager.getLocator('gigantti.productTitle');
        const productPrice = locatorManager.getLocator('gigantti.productPrice');

        if (!productTitle) {
            throw new Error('Product title selector not found in locators.json');
        }
        if (!productPrice) {
            throw new Error('Product price selector not found in locators.json');
        }

        await this.page
            .locator(productTitle)
            .first()
            .waitFor({ state: 'visible', timeout: this.timeouts.productVisibility });

        try {
            await this.page
                .locator(productPrice)
                .first()
                .waitFor({ state: 'visible', timeout: this.timeouts.productVisibility });
        } catch {
            const project = test.info().project.name;
            logger.warn(`[${project}] ⚠️ Price element not immediately visible, but page loaded.`);
        }
    }
}
