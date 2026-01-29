import { type Page, test } from '@playwright/test';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config/index.js';
import { LocatorManager } from './utils/LocatorManager.js';
import { logger } from './utils/Logger.js';

export class AutoHealer {
    private page: Page;
    private openai?: OpenAI;
    private gemini?: GoogleGenerativeAI;
    private debug: boolean;
    private provider: 'openai' | 'gemini';
    private modelName: string;

    private apiKeys: string[];
    private currentKeyIndex = 0;

    constructor(page: Page, apiKeys: string | string[], provider: 'openai' | 'gemini' = 'gemini', modelName?: string, debug = false) {
        this.page = page;
        this.debug = debug;
        this.provider = provider;
        this.modelName = modelName || (provider === 'openai' ? 'gpt-4o' : 'gemini-1.5-flash');

        this.apiKeys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];

        this.initializeClient();
    }

    private initializeClient() {
        const apiKey = this.apiKeys[this.currentKeyIndex];
        if (!apiKey) return;

        if (this.provider === 'openai') {
            this.openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        } else {
            this.gemini = new GoogleGenerativeAI(apiKey);
        }
    }

    private rotateKey(): boolean {
        if (this.currentKeyIndex < this.apiKeys.length - 1) {
            this.currentKeyIndex++;
            if (this.debug) logger.info(`[AutoHealer] Rotating to API Key #${this.currentKeyIndex + 1}`);
            this.initializeClient();
            return true;
        }
        return false;
    }

    /**
     * Safe click method that attempts self-healing on failure
     */
    async click(selectorOrKey: string, options?: any) {
        const locatorManager = LocatorManager.getInstance();
        let selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting click on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.click(selector, { timeout: config.test.timeouts.click, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] Click failed. Initiating healing protocol (${this.provider})...`);
            const newSelector = await this.heal(selector, error as Error);
            if (newSelector) {
                logger.info(`[AutoHealer] Retrying with new selector: ${newSelector}`);
                await this.page.click(newSelector, options);

                // Update locator if we have a key
                if (locatorKey) {
                    logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                    locatorManager.updateLocator(locatorKey, newSelector);
                }
            } else {
                throw error; // Re-throw if healing failed
            }
        }
    }

    /**
     * Safe fill method that attempts self-healing on failure
     */
    async fill(selectorOrKey: string, value: string, options?: any) {
        const locatorManager = LocatorManager.getInstance();
        let selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting fill on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.fill(selector, value, { timeout: config.test.timeouts.fill, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] Fill failed. Initiating healing protocol (${this.provider})...`);
            const newSelector = await this.heal(selector, error as Error);
            if (newSelector) {
                logger.info(`[AutoHealer] Retrying with new selector: ${newSelector}`);
                await this.page.fill(newSelector, value, options);

                // Update locator if we have a key
                if (locatorKey) {
                    logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                    locatorManager.updateLocator(locatorKey, newSelector);
                }
            } else {
                throw error;
            }
        }
    }

    /**
     * Core healing logic
     */
    private async heal(originalSelector: string, error: Error): Promise<string | null> {

        // 1. Capture simplified DOM
        const htmlSnapshot = await this.getSimplifiedDOM();

        // 2. Construct Prompt
        const promptText = config.ai.prompts.healingPrompt(originalSelector, error.message, htmlSnapshot.substring(0, 2000));

        try {
            let result: string | undefined;

            const maxRetries = config.ai.healing.maxRetries;
            const maxKeyRotations = this.apiKeys.length;

            // Outer loop for key rotation
            for (let k = 0; k < maxKeyRotations; k++) {
                try {
                    if (this.provider === 'openai' && this.openai) {
                        const completion = await this.openai.chat.completions.create({
                            messages: [{ role: 'user', content: promptText }],
                            model: this.modelName,
                        });
                        result = completion.choices[0]?.message.content?.trim();
                    } else if (this.provider === 'gemini' && this.gemini) {
                        const model = this.gemini.getGenerativeModel({ model: this.modelName });
                        const resultResult = await model.generateContent(promptText);
                        result = resultResult.response.text().trim();
                    }
                    // If success, break loop
                    break;
                } catch (reqError: any) {
                    const isRateLimit = reqError.message?.includes('429') || reqError.status === 429;
                    const isAuthError = reqError.message?.includes('401') || reqError.status === 401;

                    if (isRateLimit) {
                        logger.warn(`[AutoHealer] Rate limit (429) detected. Skipping test to avoid timeout.`);
                        test.info().annotations.push({ type: 'warning', description: 'Test skipped due to AI Rate Limit (429)' });
                        test.skip(true, 'Test skipped due to AI Rate Limit (429)');
                        return null; // Should not be reached effectively, but satisfies types
                    }

                    if (isAuthError) {
                        logger.warn(`[AutoHealer] Auth Error (${reqError.status || 'Unknown'}). Attempting key rotation...`);
                        const rotated = this.rotateKey();
                        if (rotated) {
                            continue; // Try next key
                        } else {
                            logger.error('[AutoHealer] No more API keys to try.');
                            throw reqError;
                        }
                    }
                    throw reqError;
                }
            }

            // Cleanup potential markdown code blocks if the model adds them
            if (result) {
                result = result.replace(/```/g, '').trim();
            }

            if (result && result !== "FAIL") {
                return result;
            }
        } catch (aiError: any) {
            // If it's a skip error, re-throw it so Playwright skips the test
            if (aiError.message?.includes('Test skipped')) {
                throw aiError;
            }
            logger.error(`[AutoHealer] AI Healing failed (${this.provider}): ${aiError.message || aiError}`);
        }

        return null;
    }

    /**
     * Captures the DOM and removes noise (scripts, styles, SVGs) to save tokens
     */
    private async getSimplifiedDOM(): Promise<string> {
        return await this.page.evaluate(() => {
            // Create a verify generic logic to strip non-visual elements
            const clone = document.documentElement.cloneNode(true) as HTMLElement;

            const removeTags = ['script', 'style', 'svg', 'path', 'link', 'meta', 'noscript'];
            removeTags.forEach(tag => {
                const elements = clone.querySelectorAll(tag);
                elements.forEach(el => el.remove());
            });

            // Remove comments
            const iterator = document.createNodeIterator(clone, NodeFilter.SHOW_COMMENT);
            let currentNode;
            while (currentNode = iterator.nextNode()) {
                currentNode.parentNode?.removeChild(currentNode);
            }

            return clone.outerHTML;
        });
    }
}
