import { test as base } from './fixtures/base.js';

const test = base.extend({
    autoHealer: async ({}, use) => {
        await use(undefined);
    },
});

test.describe('Subcategory Deep Navigation', () => {
    test('should navigate to computers then monitors subcategory', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.selectCategory('computers', 'monitors');
        await categoryPage.verifyProductsDisplayed();
    });

    test('should navigate to computers then allComputers subcategory', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.selectCategory('computers', 'allComputers');
        await categoryPage.verifyProductsDisplayed();
    });

    test('should navigate to computers then components subcategory', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.selectCategory('computers', 'components');
        await categoryPage.verifyProductsDisplayed();
    });

    test('should navigate to tvs then headphones subcategory', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.selectCategory('tvs', 'headphones');
        await categoryPage.verifyProductsDisplayed();
    });

    test('should navigate to gaming then consoles subcategory', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.selectCategory('gaming', 'consoles');
        await categoryPage.verifyProductsDisplayed();
    });

    test('should navigate to phones then smartphones subcategory', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.selectCategory('phones', 'smartphones');
        await categoryPage.verifyProductsDisplayed();
    });
});
