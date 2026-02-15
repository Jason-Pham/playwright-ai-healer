import { test as base } from '@playwright/test';
import { AutoHealer } from '../../src/AutoHealer.js';
import { GiganttiHomePage } from '../../src/pages/GiganttiHomePage.js';
import { config } from '../../src/config/index.js';

// Define custom fixtures
type MyFixtures = {
    autoHealer: AutoHealer;
    giganttiPage: GiganttiHomePage;
};

export const test = base.extend<MyFixtures>({
    autoHealer: async ({ page }, use, testInfo) => {
        const { ai } = config;

        // Determine provider based on available keys
        let provider: 'openai' | 'gemini';
        let apiKeys: string | string[];
        let model: string;

        if (ai.gemini.apiKey) {
            provider = 'gemini';
            apiKeys = ai.gemini.apiKey;
            model = ai.gemini.modelName;
        } else if (ai.openai.apiKeys && ai.openai.apiKeys.length > 0) {
            provider = 'openai';
            apiKeys = ai.openai.apiKeys;
            model = ai.openai.modelName;
        } else {
            throw new Error('❌ API Key missing! Check src/config/index.ts or .env');
        }

        const healer = new AutoHealer(page, apiKeys, provider, model, true);
        await use(healer);

        // After test: attach healing report to Playwright HTML report
        await healer.getHealingReporter().attach(testInfo);
    },

    giganttiPage: async ({ page, autoHealer }, use) => {
        const giganttiPage = new GiganttiHomePage(page, autoHealer);
        await use(giganttiPage);
    },
});

export { expect } from '@playwright/test';
