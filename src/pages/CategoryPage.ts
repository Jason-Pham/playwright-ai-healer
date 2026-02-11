import { BasePage } from './BasePage.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';
import { LocatorManager } from '../utils/LocatorManager.js';
import type { ProductDetailPage } from './ProductDetailPage.js';

/**
 * Category/Product Listing Page
 * Represents pages showing a list of products (category pages, search results, etc.)
 */
export class CategoryPage extends BasePage {
    private readonly timeouts = config.test.timeouts;
    private readonly locatorManager = LocatorManager.getInstance();

    async verifyProductsDisplayed() {
        logger.debug('🔍 Verifying products are displayed...');

        // Wait for page to fully load
        await this.waitForPageLoad({ networking: true, timeout: this.timeouts.default });

        // Resolve selector dynamically from LocatorManager to pick up any healed values
        const productCardSelector = this.locatorManager.getLocator('gigantti.productCard');

        if (!productCardSelector) {
            throw new Error('Product card selector not found in locators.json');
        }

        const productSelectors = [productCardSelector];

        // Wait for products to be visible
        await this.findFirstElement(productSelectors, {
            state: 'visible',
            timeout: config.test.timeouts.productVisibility,
        });

        logger.debug('✅ Products are displayed on the page.');
    }

    async clickFirstProduct(): Promise<ProductDetailPage> {
        logger.debug('🖱️ Clicking on first product...');

        // Resolve selector dynamically from LocatorManager to pick up any healed values
        const productCardSelector = this.locatorManager.getLocator('gigantti.productCard');

        if (!productCardSelector) {
            throw new Error('Product card selector not found in locators.json');
        }

        // Click on the first product card using correct Gigantti selector
        const firstProduct = this.page.locator(productCardSelector).first();
        await firstProduct.click();

        // Wait for navigation to product detail page
        await this.waitForPageLoad({ networking: true, timeout: this.timeouts.default });
        logger.debug('✅ Navigated to product detail page.');

        // Dynamically import to avoid circular dependency
        const { ProductDetailPage: ProductDetailPageClass } = await import('./ProductDetailPage.js');
        return new ProductDetailPageClass(this.page, this.autoHealer);
    }
}
