import { test as base } from '@playwright/test';
import { AutoHealer } from '../../src/AutoHealer.js';
import { GiganttiHomePage } from '../../src/pages/GiganttiHomePage.js';
import { config } from '../../src/config/index.js';
import { logger } from '../../src/utils/Logger.js';

// Define custom fixtures
type MyFixtures = {
    autoHealer: AutoHealer | undefined;
    giganttiPage: GiganttiHomePage;
};

export const test = base.extend<MyFixtures>({
    autoHealer: async ({ page }, use) => {
        const { ai } = config;

        // Determine provider based on available keys using our config logic
        let provider: 'openai' | 'gemini';
        let apiKeys: string | string[];
        let model: string;

        if (ai.gemini.apiKey) {
            provider = 'gemini';
            apiKeys = ai.gemini.apiKey;
            model = ai.gemini.modelName;
        } else if (ai.openai.apiKeys && ai.openai.apiKeys.length > 0) {
            logger.debug(`[Fixture] Checking openai keys. Length: ${ai.openai.apiKeys.length}`);
            provider = 'openai';
            // Type assertion or minor adjustment needed if AutoHealer constructor expects string | string[]
            // We changed the constructor, so this is fine.
            apiKeys = ai.openai.apiKeys;
            model = ai.openai.modelName;
        } else {
            logger.error('[Fixture] No API keys found for Gemini or OpenAI');
            throw new Error('❌ API Key missing! Check src/config/index.ts or .env');
        }

        const healer = new AutoHealer(page, apiKeys, provider, model, true);
        await use(healer);
    },

    giganttiPage: async ({ page, autoHealer }, use) => {
        const giganttiPage = new GiganttiHomePage(page, autoHealer);
        await use(giganttiPage);
    },
});

export { expect } from '@playwright/test';
