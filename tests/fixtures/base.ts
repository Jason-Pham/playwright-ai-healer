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
    autoHealer: async ({ page }, use) => {
        const { ai } = config;

        // Determine provider based on available keys using our config logic
        // This logic is slightly duplicated from config but simplified here for flow
        let provider: 'openai' | 'gemini';
        let apiKey: string;
        let model: string;

        if (ai.gemini.apiKey) {
            provider = 'gemini';
            apiKey = ai.gemini.apiKey;
            model = ai.gemini.modelName;
        } else if (ai.openai.apiKey) {
            provider = 'openai';
            apiKey = ai.openai.apiKey;
            model = ai.openai.modelName;
        } else {
            throw new Error('❌ API Key missing! Check src/config/index.ts or .env');
        }

        const healer = new AutoHealer(page, apiKey, provider, model, true);
        await use(healer);
    },

    giganttiPage: async ({ page, autoHealer }, use) => {
        const giganttiPage = new GiganttiHomePage(page, autoHealer);
        await use(giganttiPage);
    },
});

export { expect } from '@playwright/test';
