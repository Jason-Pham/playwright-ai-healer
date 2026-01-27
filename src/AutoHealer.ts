
import type { Page } from '@playwright/test';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { HealingResult } from './types.js';
import { config } from './config/index.js';

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
            if (this.debug) console.log(`[AutoHealer] Rotating to API Key #${this.currentKeyIndex + 1}`);
            this.initializeClient();
            return true;
        }
        return false;
    }

    /**
     * Safe click method that attempts self-healing on failure
     */
    async click(selector: string, options?: any) {
        try {
            if (this.debug) console.log(`[AutoHealer] Attempting click on: ${selector}`);
            await this.page.click(selector, { timeout: config.test.timeouts.click, ...options });
        } catch (error) {
            console.log(`[AutoHealer] Click failed. Initiating healing protocol (${this.provider})...`);
            const newSelector = await this.heal(selector, error as Error);
            if (newSelector) {
                console.log(`[AutoHealer] Retrying with new selector: ${newSelector}`);
                await this.page.click(newSelector, options);
            } else {
                throw error; // Re-throw if healing failed
            }
        }
    }

    /**
     * Safe fill method that attempts self-healing on failure
     */
    async fill(selector: string, value: string, options?: any) {
        try {
            if (this.debug) console.log(`[AutoHealer] Attempting fill on: ${selector}`);
            await this.page.fill(selector, value, { timeout: config.test.timeouts.fill, ...options });
        } catch (error) {
            console.log(`[AutoHealer] Fill failed. Initiating healing protocol (${this.provider})...`);
            const newSelector = await this.heal(selector, error as Error);
            if (newSelector) {
                console.log(`[AutoHealer] Retrying with new selector: ${newSelector}`);
                await this.page.fill(newSelector, value, options);
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
                // Inner loop for retries on same key (optional, or mix)
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
                    // If success, break both loops
                    break;
                } catch (reqError: any) {
                    const isRateLimit = reqError.message?.includes('429') || reqError.status === 429;
                    const isAuthError = reqError.message?.includes('401') || reqError.status === 401;

                    if (isRateLimit || isAuthError) {
                        console.log(`[AutoHealer] AI Error (${reqError.status || 'Unknown'}). Attempting key rotation...`);
                        const rotated = this.rotateKey();
                        if (rotated) {
                            continue; // Try next key
                        } else {
                            console.log('[AutoHealer] No more API keys to try.');
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
        } catch (aiError) {
            console.error(`[AutoHealer] AI Healing failed (${this.provider}):`, aiError);
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
