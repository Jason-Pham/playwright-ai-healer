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

        // Wait for page to fully load
        await this.waitForPageLoad({ networking: true, timeout: this.timeouts.default });

        // Primary selector from actual Gigantti search page structure
        const productSelectors = ['[data-testid="product-card"]'];

        // Wait for products to be visible
        await this.findFirstElement(productSelectors, {
            state: 'visible',
            timeout: config.test.timeouts.productVisibility,
        });

        logger.debug('✅ Products are displayed on the page.');
    }

    async clickFirstProduct(): Promise<ProductDetailPage> {
        logger.debug('🖱️ Clicking on first product...');

        // Click on the first product card using correct Gigantti selector
        const firstProduct = this.page.locator('[data-testid="product-card"]').first();
        await firstProduct.click({ force: true });

        // Wait for navigation to product detail page
        await this.waitForPageLoad({ networking: true, timeout: this.timeouts.default });
        logger.debug('✅ Navigated to product detail page.');

        // Dynamically import to avoid circular dependency
        const { ProductDetailPage: ProductDetailPageClass } = await import('./ProductDetailPage.js');
        return new ProductDetailPageClass(this.page, this.autoHealer);
    }
}
