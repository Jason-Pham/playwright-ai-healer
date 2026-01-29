import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';
import type { ProductDetailPage } from './ProductDetailPage.js';

/**
 * Category/Product Listing Page
 * Represents pages showing a list of products (category pages, search results, etc.)
 */
export class CategoryPage extends BasePage {
    private readonly timeouts = config.test.timeouts;

    async verifyProductsDisplayed() {
        logger.info('🔍 Verifying products are displayed...');

        // Look for product cards on the page
        const productCards = this.page.locator('article, [class*="product"], [data-test*="product"]').first();
        await expect(productCards).toBeVisible({ timeout: this.timeouts.productVisibility });

        logger.info('✅ Products are displayed on the page.');
    }

    async clickFirstProduct(): Promise<ProductDetailPage> {
        logger.info('🖱️ Clicking on first product...');

        // Dismiss any remaining overlays first
        await this.dismissOverlays();

        // Click on the first product link/card
        const firstProduct = this.page.locator('article a, [class*="product"] a').first();
        await firstProduct.click({ force: true });

        // Wait for navigation
        await this.page.waitForLoadState('networkidle');
        logger.info('✅ Clicked on first product.');

        // Dynamically import to avoid circular dependency
        const { ProductDetailPage: ProductDetailPageClass } = await import('./ProductDetailPage.js');
        return new ProductDetailPageClass(this.page, this.autoHealer);
    }

    /**
     * Dismiss any overlay modals (cookie banners, popups, etc.)
     */
    private async dismissOverlays() {
        try {
            const overlaySelectors = [
                '#cookie-information-template-wrapper button:has-text("OK")',
                '[id*="cookie"] button',
                '.modal-close',
                '[aria-label="Close"]',
            ];

            for (const selector of overlaySelectors) {
                const overlay = this.page.locator(selector).first();
                if (await overlay.isVisible({ timeout: this.timeouts.overlayCheck }).catch(() => false)) {
                    await overlay.click({ force: true });
                    await this.page.waitForTimeout(this.timeouts.overlayWait);
                }
            }
        } catch {
            // Ignore errors - overlays are optional
        }
    }
}
