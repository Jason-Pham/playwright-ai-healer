import { test as base } from './fixtures/base.js';

const test = base.extend({
    autoHealer: async ({}, use) => {
        await use(undefined);
    },
});

test.describe('Category Browsing', () => {
    const categories = ['phones', 'tvs', 'gaming'] as const;

    for (const category of categories) {
        test(`should navigate to ${category} category and display products`, async ({ giganttiPage }) => {
            await giganttiPage.open();
            const categoryPage = await giganttiPage.selectCategory(category);
            await categoryPage.verifyProductsDisplayed();
        });
    }

    test('should navigate to computers category and display content', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.selectCategory('computers');
        await categoryPage.verifyProductsDisplayed();
    });

    test('should navigate to appliances category and display content', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const categoryPage = await giganttiPage.selectCategory('appliances');
        await categoryPage.verifyProductsDisplayed();
    });
});
