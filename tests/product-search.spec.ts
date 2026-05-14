import { test as base } from './fixtures/base.js';
import { config } from '../src/config/index.js';

const test = base.extend({
    autoHealer: async ({}, use) => {
        await use(undefined);
    },
});

test.describe('Product Search and Navigation', () => {
    test('should search for a product and land on search results', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const searchTerm = config.testData.searchTerms[0]!;
        const searchResultsPage = await giganttiPage.searchFor(searchTerm);
        await searchResultsPage.verifyProductsDisplayed();
    });

    test('should search and navigate to product detail page with loaded details', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const searchResultsPage = await giganttiPage.searchFor('televisio');
        await searchResultsPage.verifyProductsDisplayed();
        const productDetailPage = await searchResultsPage.clickFirstProduct();
        await productDetailPage.verifyProductDetailsLoaded();
    });

    test('should search for different terms and get results each time', async ({ giganttiPage }) => {
        await giganttiPage.open();

        // First search
        const firstTerm = 'kuulokkeet';
        const firstResults = await giganttiPage.searchFor(firstTerm);
        await firstResults.verifyProductsDisplayed();

        // Navigate back to home and search again with a different term
        await giganttiPage.open();
        const secondTerm = 'kamera';
        const secondResults = await giganttiPage.searchFor(secondTerm);
        await secondResults.verifyProductsDisplayed();
    });
});
