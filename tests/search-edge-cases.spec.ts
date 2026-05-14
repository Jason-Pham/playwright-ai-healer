import { test as base, expect } from './fixtures/base.js';
import { config } from '../src/config/index.js';

const test = base.extend({
    autoHealer: async ({}, use) => {
        await use(undefined);
    },
});

test.describe('Search Edge Cases', () => {
    test('should handle search for gibberish term gracefully', async ({ giganttiPage }) => {
        await giganttiPage.open();

        // Search for a nonsense string that should return no meaningful results
        const gibberishTerm = 'zxqwkjmn99847xyz';
        const resultsPage = await giganttiPage.searchFor(gibberishTerm);

        // The page should still load without errors — either showing a "no results"
        // message or an empty product grid. We verify the page is functional by
        // checking it navigated to a search URL.
        await expect(giganttiPage.page).toHaveURL(/search|haku|query|find/, {
            timeout: config.test.timeouts.default,
        });
    });

    test('should handle search for single character term', async ({ giganttiPage }) => {
        await giganttiPage.open();

        // Single character search — site should still respond
        const resultsPage = await giganttiPage.searchFor('a');
        await expect(giganttiPage.page).toHaveURL(/search|haku|query|find|\/a/, {
            timeout: config.test.timeouts.default,
        });
    });

    test('should handle search for numeric term', async ({ giganttiPage }) => {
        await giganttiPage.open();

        // Numeric search term
        const resultsPage = await giganttiPage.searchFor('12345');
        await expect(giganttiPage.page).toHaveURL(/search|haku|query|find|12345/, {
            timeout: config.test.timeouts.default,
        });
    });
});
