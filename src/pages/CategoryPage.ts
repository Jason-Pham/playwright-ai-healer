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
        logger.debug('🔍 Verifying products are displayed...');

        // Wait for page to fully load - domcontentloaded is more stable for WebKit than networkidle
        await this.page.waitForLoadState('domcontentloaded');

        // Try multiple product card selectors (Gigantti-specific)
        // Try multiple product card selectors combined
        // This allows Playwright to wait for ANY of them to become visible
        const productSelectors = [
            '[data-test*="product"]',
            '[class*="ProductCard"]',
            '[class*="product-card"]',
            'article[class*="product"]',
            '.product-list article',
            '[class*="ProductList"] > div',
            'article', // Fallback generic article
            'main a[href*="/product"]' // Fallback product link
        ];

        const combinedSelector = productSelectors.join(',');

        try {
            await this.page.locator(combinedSelector).first().waitFor({ state: 'visible', timeout: this.timeouts.productVisibility });
        } catch (e) {
            logger.warn(`Could not find any product card. Page might be empty or loading failed. Error: ${e}`);
            throw e;
        }

        logger.debug('✅ Products are displayed on the page.');
    }

    async clickFirstProduct(): Promise<ProductDetailPage> {
        logger.debug('🖱️ Clicking on first product...');

        // Dismiss any remaining overlays first
        await this.dismissOverlays();

        // Click on the first product link/card
        const firstProduct = this.page.locator('article a, [class*="product"] a').first();
        await firstProduct.click({ force: true });

        // Wait for navigation
        await this.page.waitForLoadState('domcontentloaded');
        logger.debug('✅ Clicked on first product.');

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
