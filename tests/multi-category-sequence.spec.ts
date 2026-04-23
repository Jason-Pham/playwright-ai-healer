import { test as base } from './fixtures/base.js';

const test = base.extend({
    autoHealer: async ({}, use) => {
        await use(undefined);
    },
});

test.describe('Multi-Category Sequential Navigation', () => {
    test('should navigate between phones and tvs categories in sequence', async ({ giganttiPage }) => {
        await giganttiPage.open();

        // Navigate to phones
        const phonesPage = await giganttiPage.selectCategory('phones');
        await phonesPage.verifyProductsDisplayed();

        // Navigate back to home and then to TVs
        await giganttiPage.open();
        const tvsPage = await giganttiPage.selectCategory('tvs');
        await tvsPage.verifyProductsDisplayed();
    });

    test('should navigate between gaming and computers categories in sequence', async ({ giganttiPage }) => {
        await giganttiPage.open();

        // Navigate to gaming
        const gamingPage = await giganttiPage.selectCategory('gaming');
        await gamingPage.verifyProductsDisplayed();

        // Navigate back to home and then to computers
        await giganttiPage.open();
        const computersPage = await giganttiPage.selectCategory('computers');
        await computersPage.verifyProductsDisplayed();
    });

    test('should navigate to category then subcategory then different category', async ({ giganttiPage }) => {
        await giganttiPage.open();

        // First: computers > monitors
        const monitorsPage = await giganttiPage.selectCategory('computers', 'monitors');
        await monitorsPage.verifyProductsDisplayed();

        // Then: navigate to a completely different top-level category
        await giganttiPage.open();
        const gamingPage = await giganttiPage.selectCategory('gaming');
        await gamingPage.verifyProductsDisplayed();
    });
});
