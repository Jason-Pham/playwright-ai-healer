import { test as base } from './fixtures/base.js';
import { config } from '../src/config/index.js';

const test = base.extend({
    autoHealer: async ({}, use) => {
        await use(undefined);
    },
});

test.describe('Product Detail Verification', () => {
    test('should verify product details after searching for kuulokkeet', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const resultsPage = await giganttiPage.searchFor('kuulokkeet');
        await resultsPage.verifyProductsDisplayed();
        const productPage = await resultsPage.clickFirstProduct();
        await productPage.verifyProductDetailsLoaded();
    });

    test('should verify product details after searching for puhelin', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const resultsPage = await giganttiPage.searchFor('puhelin');
        await resultsPage.verifyProductsDisplayed();
        const productPage = await resultsPage.clickFirstProduct();
        await productPage.verifyProductDetailsLoaded();
    });

    test('should verify product details from category navigation', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.selectCategory('phones', 'smartphones');
        await categoryPage.verifyProductsDisplayed();
        const productPage = await categoryPage.clickFirstProduct();
        await productPage.verifyProductDetailsLoaded();
    });
});
