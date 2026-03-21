import { test as base } from './fixtures/base.js';
import { config } from '../src/config/index.js';

const test = base.extend({
    autoHealer: async ({ }, use) => {
        await use(undefined);
    },
});

test.describe('Gigantti.fi E2E Tests', () => {
    test('should click on a product and verify product details page', async ({ giganttiPage }) => {
        await giganttiPage.open();
        const searchTerm = config.testData.getRandomSearchTerm();
        const searchResultsPage = await giganttiPage.searchFor(searchTerm);
        await searchResultsPage.verifyProductsDisplayed();
        const productDetailPage = await searchResultsPage.clickFirstProduct();
        await productDetailPage.verifyProductDetailsLoaded();
    });

    test.describe('Category Navigation', () => {
        const categories = ['computers', 'phones', 'tvs', 'gaming', 'appliances'] as const;

        for (const category of categories) {
            test(`should navigate to ${category} category and verify content`, async ({ giganttiPage }) => {
                await giganttiPage.open();
                const categoryPage = await giganttiPage.selectCategory(category);
                await categoryPage.verifyProductsDisplayed();
            });
        }
    });

    test.describe('Subcategory Navigation', () => {
        test('should navigate to computers → allComputers', async ({ giganttiPage }) => {
            await giganttiPage.open();
            const categoryPage = await giganttiPage.selectCategory('computers', 'allComputers');
            await categoryPage.verifyProductsDisplayed();
        });

        test('should navigate to appliances → washingMachines', async ({ giganttiPage }) => {
            await giganttiPage.open();
            const categoryPage = await giganttiPage.selectCategory('appliances', 'washingMachines');
            await categoryPage.verifyProductsDisplayed();
        });
    });
});
