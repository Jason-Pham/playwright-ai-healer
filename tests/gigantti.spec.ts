import { test } from './fixtures/base.js';
import { config } from '../src/config/index.js';

test.describe('Gigantti.fi E2E Tests', () => {

    test('should search for a product and verify results', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const searchTerm = config.testData.getRandomSearchTerm();
        const searchResultsPage = await giganttiPage.searchFor(searchTerm);
        await searchResultsPage.verifyProductsDisplayed();
    });

    test('should navigate to a category and verify products are displayed', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.navigateToCategory(config.testData.categories.computers);
        await categoryPage.verifyProductsDisplayed();
    });

    test('should click on a product and verify product details page', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const searchTerm = config.testData.getRandomSearchTerm();
        const searchResultsPage = await giganttiPage.searchFor(searchTerm);
        await searchResultsPage.verifyProductsDisplayed();
        const productDetailPage = await searchResultsPage.clickFirstProduct();
        await productDetailPage.verifyProductDetailsLoaded();
    });

});
