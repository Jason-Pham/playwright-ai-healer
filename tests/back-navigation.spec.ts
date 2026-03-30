import { test as base, expect } from './fixtures/base.js';
import { config } from '../src/config/index.js';

const test = base.extend({
    autoHealer: async ({}, use) => {
        await use(undefined);
    },
});

test.describe('Back Navigation', () => {
    test('should navigate to product detail and go back to search results', async ({ giganttiPage }) => {
        await giganttiPage.open();

        const searchTerm = 'kannettava';
        const resultsPage = await giganttiPage.searchFor(searchTerm);
        await resultsPage.verifyProductsDisplayed();

        // Capture the search results URL before navigating away
        const searchUrl = giganttiPage.page.url();

        // Navigate to a product detail page
        const productPage = await resultsPage.clickFirstProduct();
        await productPage.verifyProductDetailsLoaded();

        // Go back to search results
        await giganttiPage.page.goBack({ waitUntil: 'load' });

        // Verify we are back on a search-like URL
        await expect(giganttiPage.page).toHaveURL(/search|haku|query|find|kannettava/, {
            timeout: config.test.timeouts.default,
        });
    });

    test('should navigate to category product and go back to category listing', async ({ giganttiPage }) => {
        await giganttiPage.open();

        const categoryPage = await giganttiPage.selectCategory('gaming');
        await categoryPage.verifyProductsDisplayed();

        // Capture URL before clicking into a product
        const categoryUrl = giganttiPage.page.url();

        const productPage = await categoryPage.clickFirstProduct();
        await productPage.verifyProductDetailsLoaded();

        // Go back
        await giganttiPage.page.goBack({ waitUntil: 'load' });

        // The URL should be back to the category page or at least not the product detail
        await expect(giganttiPage.page).not.toHaveURL(/\/product\/|\/tuote\//, {
            timeout: config.test.timeouts.default,
        });
    });
});
