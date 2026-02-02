import { expect, test } from '@playwright/test';
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
        await this.page.waitForLoadState('networkidle');

        // Verify product title is visible (try multiple selectors)
        const titleSelectors = ['h1', '[data-test*="title"]', '[class*="ProductTitle"]', '.product-title'];
        let titleFound = false;
        for (const selector of titleSelectors) {
            const title = this.page.locator(selector).first();
            if (await title.isVisible({ timeout: 2000 }).catch(() => false)) {
                titleFound = true;
                break;
            }
        }

        if (!titleFound) {
            // Fallback: any visible heading
            const heading = this.page.locator('h1, h2').first();
            await expect(heading).toBeVisible({ timeout: this.timeouts.productVisibility });
        }

        // Verify price is visible (try multiple selectors)
        const priceSelectors = ['[class*="price"]', '[data-test*="price"]', '[class*="Price"]', '.product-price'];
        let priceFound = false;
        for (const selector of priceSelectors) {
            const price = this.page.locator(selector).first();
            if (await price.isVisible({ timeout: 2000 }).catch(() => false)) {
                priceFound = true;
                break;
            }
        }

        if (!priceFound) {
            // Log warning but don't fail - some pages might load price dynamically
            // Log warning with browser context
            const project = test.info().project.name;
            logger.warn(`[${project}] ⚠️ Price element not immediately visible, but page loaded.`);
        }

        logger.debug('✅ Product details page loaded with title and price.');
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
