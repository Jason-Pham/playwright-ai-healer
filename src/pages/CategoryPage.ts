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
        // Target clickable links and visible containers, NOT hidden child elements
        const productSelectors = [
            'a[href*="/product/"]',  // Most reliable - direct product links
            'article a[href*="/tuote/"]',  // Finnish product URLs
            '[data-test-id*="product"] a',  // Test ID product links
            'article.product-card a',  // Article with product-card class containing link
            '.product-list a[href*="/product"]',  // Links within product list
            'main article a:has(img)',  // Articles with images (likely products)
            'a:has([class*="product-card"])',  // Links containing product card elements
            'article:has(h2) a',  // Articles with headings (product titles)
        ];

        try {
            await this.findFirstElement(productSelectors, {
                state: 'visible',
                timeout: this.timeouts.productVisibility
            });
        } catch (e) {
            logger.warn(`Could not find any product card after ${this.timeouts.productVisibility}ms. Page content might be blocked or empty.`);
            throw e;
        }

        logger.debug('✅ Products are displayed on the page.');
    }

    async clickFirstProduct(): Promise<ProductDetailPage> {
        logger.debug('🖱️ Clicking on first product...');

        // Click on the first product link using improved selectors
        // Prioritize actual product links over generic elements
        const firstProduct = this.page.locator('a[href*="/product/"], article a[href*="/tuote/"], article.product-card a').first();
        await firstProduct.click({ force: true });

        // Wait for navigation to product detail page
        await this.page.waitForLoadState('domcontentloaded');
        logger.debug('✅ Navigated to product detail page.');

        // Dynamically import to avoid circular dependency
        const { ProductDetailPage: ProductDetailPageClass } = await import('./ProductDetailPage.js');
        return new ProductDetailPageClass(this.page, this.autoHealer);
    }
}
