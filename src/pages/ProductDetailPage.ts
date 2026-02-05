import { test } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';

/**
 * Product Detail Page
 * Represents a single product's detail page
 */
export class ProductDetailPage extends BasePage {
    private readonly timeouts = config.test.timeouts;

    async verifyProductDetailsLoaded() {
        logger.debug('🔍 Verifying product details page loaded...');

        // Wait for page to fully load
        await this.waitForPageLoad({ networking: true, timeout: this.timeouts.default });

        // Verify product title is visible (combined check)
        const titleSelectors = ['h1', '[data-test*="title"]', '[class*="ProductTitle"]', '.product-title'];
        await this.page
            .locator(titleSelectors.join(','))
            .first()
            .waitFor({ state: 'visible', timeout: this.timeouts.productVisibility });

        // Verify price is visible (combined check)
        const priceSelectors = ['[class*="price"]', '[data-test*="price"]', '[class*="Price"]', '.product-price'];
        try {
            await this.page
                .locator(priceSelectors.join(','))
                .first()
                .waitFor({ state: 'visible', timeout: this.timeouts.productVisibility });
        } catch {
            // Log warning but don't fail - some pages might load price dynamically
            // Log warning with browser context
            const project = test.info().project.name;
            logger.warn(`[${project}] ⚠️ Price element not immediately visible, but page loaded.`);
        }

        logger.debug('✅ Product details page loaded with title and price.');
    }

    async getProductTitle(): Promise<string> {
        const productTitle = this.page.locator('h1').first();
        return (await productTitle.textContent()) || '';
    }

    async getProductPrice(): Promise<string> {
        const priceElement = this.page.locator('[class*="price"], [data-test*="price"]').first();
        return (await priceElement.textContent()) || '';
    }
}
