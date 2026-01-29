import { expect } from '@playwright/test';
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
        logger.info('🔍 Verifying product details page loaded...');

        // Verify product title is visible
        const productTitle = this.page.locator('h1').first();
        await expect(productTitle).toBeVisible({ timeout: this.timeouts.productVisibility });

        // Verify price is visible
        const priceElement = this.page.locator('[class*="price"], [data-test*="price"]').first();
        await expect(priceElement).toBeVisible({ timeout: this.timeouts.priceVisibility });

        logger.info('✅ Product details page loaded with title and price.');
    }

    async getProductTitle(): Promise<string> {
        const productTitle = this.page.locator('h1').first();
        return await productTitle.textContent() || '';
    }

    async getProductPrice(): Promise<string> {
        const priceElement = this.page.locator('[class*="price"], [data-test*="price"]').first();
        return await priceElement.textContent() || '';
    }
}
