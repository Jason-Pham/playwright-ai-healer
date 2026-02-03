import { test, expect } from './fixtures/base.js';
import { config } from '../src/config/index.js';

test.describe('Gigantti.fi E2E Tests', () => {
    test('should search for a product and verify results', async ({ giganttiPage, page }) => {
        await giganttiPage.open();
        
        // Verify we're on the home page
        expect(page.url()).toContain('gigantti.fi');
        
        const searchTerm = config.testData.getRandomSearchTerm();
        const searchResultsPage = await giganttiPage.searchFor(searchTerm);
        await searchResultsPage.verifyProductsDisplayed();
        
        // Verify we have product cards visible
        const productCards = page.locator('[data-testid="product-card"]');
        await expect(productCards.first()).toBeVisible({ timeout: 30000 });
    });

    // test('should navigate to a category and verify products are displayed', async ({ giganttiPage }) => {
    //     await giganttiPage.open();
    //     const categoryPage = await giganttiPage.navigateToCategory(config.testData.categories.computers);
    //     await categoryPage.verifyProductsDisplayed();
    // });

    test('should click on a product and verify product details page', async ({ giganttiPage, page }) => {
        await giganttiPage.open();
        const searchTerm = config.testData.getRandomSearchTerm();
        const searchResultsPage = await giganttiPage.searchFor(searchTerm);
        await searchResultsPage.verifyProductsDisplayed();
        const productDetailPage = await searchResultsPage.clickFirstProduct();
        await productDetailPage.verifyProductDetailsLoaded();
        
        // Verify product title exists
        const productTitle = page.locator('h1').first();
        await expect(productTitle).toBeVisible({ timeout: 30000 });
        
        // Verify title has content
        const titleText = await productTitle.textContent();
        expect(titleText).toBeTruthy();
    });
});
