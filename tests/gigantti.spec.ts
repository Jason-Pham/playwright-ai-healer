
import { test } from './fixtures/base.js';
import { config } from '../src/config/index.js';

test.describe('Gigantti.fi Self-Healing Demo', () => {

    test('should search for Samsung Fold using self-healing', async ({ giganttiPage }) => {
        await giganttiPage.open();
        await giganttiPage.searchFor(config.testData.searchTerms.default);
        await giganttiPage.verifySearchResultsLoaded();
    });

});
