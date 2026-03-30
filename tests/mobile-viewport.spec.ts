import { test as base } from './fixtures/base.js';
import { config } from '../src/config/index.js';

const test = base.extend({
    autoHealer: async ({}, use) => {
        await use(undefined);
    },
});

/**
 * Mobile viewport tests.
 *
 * These tests verify that core journeys work at mobile screen dimensions.
 * They run on all configured projects — when executed against the mobile-chrome,
 * mobile-safari, or tablet project the viewport is automatically set by the
 * Playwright device descriptor. On desktop projects they still exercise the
 * same flows at the default viewport, which is valuable for regression coverage.
 */
test.describe('Mobile Viewport Journeys', () => {
    test('should search for a product on mobile viewport', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const searchTerm = 'tabletti';
        const resultsPage = await giganttiPage.searchFor(searchTerm);
        await resultsPage.verifyProductsDisplayed();
    });

    test('should navigate to a category on mobile viewport', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.selectCategory('phones');
        await categoryPage.verifyProductsDisplayed();
    });

    test('should navigate to subcategory and view product details on mobile', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.selectCategory('tvs', 'headphones');
        await categoryPage.verifyProductsDisplayed();
        const productPage = await categoryPage.clickFirstProduct();
        await productPage.verifyProductDetailsLoaded();
    });
});
