import { type Page, test } from '@playwright/test';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config/index.js';
import { LocatorManager } from './utils/LocatorManager.js';
import { logger } from './utils/Logger.js';
import type { AIProvider, ClickOptions, FillOptions, AIError, HealingResult, HealingEvent } from './types.js';

/**
 * AutoHealer - Self-healing test automation agent
 *
 * This class wraps Playwright page interactions and automatically attempts to heal
 * broken selectors using AI (OpenAI or Google Gemini) when interactions fail.
 *
 * @example
 * ```typescript
 * const healer = new AutoHealer(page, 'your-api-key', 'gemini');
 * await healer.click('#submit-button');
 * await healer.fill('#search-input', 'test query');
 * ```
 */
export class AutoHealer {
    private page: Page;
    private openai?: OpenAI;
    private gemini?: GoogleGenerativeAI;
    private debug: boolean;
    private provider: AIProvider;
    private modelName: string;
    private healingEvents: HealingEvent[] = [];

    private apiKeys: string[];
    private currentKeyIndex = 0;

    /**
     * Creates an AutoHealer instance
     *
     * @param page - Playwright page instance
     * @param apiKeys - API key(s) for the AI provider. Can be a single key or array for rotation
     * @param provider - AI provider to use ('openai' or 'gemini')
     * @param modelName - Model name to use (defaults based on provider)
     * @param debug - Enable debug logging
     */
    constructor(
        page: Page,
        apiKeys: string | string[],
        provider: AIProvider = 'gemini',
        modelName?: string,
        debug = false
    ) {
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
     *
     * Attempts to click on an element. If the click fails, uses AI to find
     * a new selector and retries the click.
     *
     * @param selectorOrKey - CSS selector or locator key from locators.json
     * @param options - Playwright click options
     * @throws Error if healing fails or element still cannot be found
     */
    async click(selectorOrKey: string, options?: ClickOptions) {
        await this.executeAction(
            selectorOrKey,
            'click',
            async selector => {
                await this.page.click(selector, { timeout: config.test.timeouts.short, ...options });
            },
            async selector => {
                await this.page.click(selector, options);
            }
        );
    }

    /**
     * Safe fill method that attempts self-healing on failure
     *
     * Attempts to fill an input element. If the fill fails, uses AI to find
     * a new selector and retries the fill.
     *
     * @param selectorOrKey - CSS selector or locator key from locators.json
     * @param value - Text value to fill
     * @param options - Playwright fill options
     * @throws Error if healing fails or element still cannot be found
     */
    async fill(selectorOrKey: string, value: string, options?: FillOptions) {
        await this.executeAction(
            selectorOrKey,
            'fill',
            async selector => {
                await this.page.fill(selector, value, { timeout: config.test.timeouts.short, ...options });
            },
            async selector => {
                await this.page.fill(selector, value, options);
            }
        );
    }

    private async executeAction(
        selectorOrKey: string,
        actionName: string,
        actionFn: (selector: string) => Promise<void>,
        retryFn: (selector: string) => Promise<void>
    ) {
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug)
                logger.debug(`[AutoHealer] Attempting ${actionName} on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.locator(selector).waitFor({ state: 'visible', timeout: config.test.timeouts.default });
            await actionFn(selector);
        } catch (error) {
            logger.warn(
                `[AutoHealer] ${actionName} failed on: ${selector}. Initiating healing protocol (${this.provider})...`
            );
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await retryFn(result.selector);

                // Update locator if we have a key
                if (locatorKey) {
                    logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                    locatorManager.updateLocator(locatorKey, result.selector);
                }
            } else {
                throw error;
            }
        }
    }

    /**
     * Get all healing events recorded during the current session
     */
    getHealingEvents(): readonly HealingEvent[] {
        return this.healingEvents;
    }

    /**
     * Core healing logic - attempts to find a new selector using AI
     *
     * @param originalSelector - The selector that failed
     * @param error - The error that occurred
     * @returns New selector if healing succeeds, null otherwise
     * @private
     */
    private async heal(originalSelector: string, error: Error): Promise<HealingResult | null> {
        const startTime = Date.now();
        // 1. Capture simplified DOM
        const htmlSnapshot = await this.getSimplifiedDOM();

        // 2. Construct Prompt
        const promptText = config.ai.prompts.healingPrompt(
            originalSelector,
            error.message,
            htmlSnapshot.substring(0, 2000)
        );

        let healingSuccess = false;
        let healingResult: HealingResult | null = null;

        try {
            let result: string | undefined;

            const maxKeyRotations = this.apiKeys.length;

            // Outer loop for key rotation
            keyLoop: for (let k = 0; k < maxKeyRotations; k++) {
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount <= maxRetries) {
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
                        break keyLoop;
                    } catch (reqError) {
                        const reqErrorTyped = reqError as AIError;
                        const errorMessage = reqErrorTyped.message?.toLowerCase() || '';

                        // Handle 503 Service Unavailable / 5xx Server Errors
                        const isServiceUnavailable =
                            reqErrorTyped.status === 503 ||
                            errorMessage.includes('503') ||
                            errorMessage.includes('service unavailable') ||
                            errorMessage.includes('overloaded');

                        if (isServiceUnavailable) {
                            if (retryCount < maxRetries) {
                                retryCount++;
                                const delay = Math.pow(2, retryCount) * 1000;
                                logger.warn(
                                    `[AutoHealer] AI Service Unavailable (503). Retrying in ${delay / 1000}s... (Attempt ${retryCount}/${maxRetries})`
                                );
                                await new Promise(resolve => setTimeout(resolve, delay));
                                continue;
                            } else {
                                logger.error(`[AutoHealer] AI Service Unavailable after ${maxRetries} retries.`);
                            }
                        }

                        const isRateLimit =
                            reqErrorTyped.status === 429 ||
                            errorMessage.includes('429') ||
                            errorMessage.includes('rate limit') ||
                            errorMessage.includes('resource exhausted') ||
                            errorMessage.includes('insufficient quota');

                        if (isRateLimit) {
                            logger.warn(`[AutoHealer] Rate limit detected. Skipping test.`);
                            test.info().annotations.push({
                                type: 'warning',
                                description: 'Test skipped due to AI Rate Limit',
                            });
                            // This throws an error to stop the test
                            test.skip(true, 'Test skipped due to AI Rate Limit');
                            // This part is unreachable if test.skip throws as expected
                            return null;
                        }

                        if (reqErrorTyped.status === 401 || errorMessage.includes('401')) {
                            logger.warn(`[AutoHealer] Auth Error. Attempting key rotation...`);
                            const rotated = this.rotateKey();
                            if (rotated) {
                                continue keyLoop; // Try next key
                            } else {
                                logger.error('[AutoHealer] No more API keys to try.');
                                throw reqErrorTyped;
                            }
                        }
                        throw reqErrorTyped;
                    }
                }
            }

            // Cleanup potential markdown code blocks if the model adds them
            if (result) {
                result = result.replace(/```/g, '').trim();
            }

            if (result && result !== 'FAIL') {
                healingSuccess = true;
                healingResult = {
                    selector: result,
                    confidence: 1.0,
                    reasoning: 'AI found replacement selector.',
                    strategy: 'css',
                };
            }
        } catch (aiError) {
            const aiErrorTyped = aiError as Error;
            // If it's a skip error, re-throw it so Playwright skips the test
            if (
                String(aiErrorTyped).includes('Test skipped') ||
                aiErrorTyped.message?.includes('Test skipped') ||
                aiErrorTyped.message?.includes('Test is skipped')
            ) {
                throw aiErrorTyped;
            }
            logger.error(
                `[AutoHealer] AI Healing failed (${this.provider}): ${aiErrorTyped.message || String(aiErrorTyped)}`
            );
        } finally {
            // Record the healing event
            this.healingEvents.push({
                timestamp: new Date().toISOString(),
                originalSelector,
                result: healingResult,
                error: healingSuccess ? '' : error.message,
                success: healingSuccess,
                provider: this.provider,
                durationMs: Date.now() - startTime,
            });
        }

        return healingResult;
    }

    /**
     * Captures the DOM and removes noise (scripts, styles, SVGs) to save tokens
     *
     * @returns Simplified HTML string
     * @private
     */
    private async getSimplifiedDOM(): Promise<string> {
        return await this.page.evaluate(() => {
            // Create a clone to strip non-visual elements
            const clone = document.documentElement.cloneNode(true) as HTMLElement;

            // 1. Remove non-visual/noisy tags
            const removeTags = [
                'script',
                'style',
                'svg',
                'path',
                'link',
                'meta',
                'noscript',
                'iframe',
                'video',
                'audio',
                'object',
                'embed',
            ];
            removeTags.forEach(tag => {
                const elements = clone.querySelectorAll(tag);
                elements.forEach(el => el.remove());
            });

            // 2. Remove comments
            const iterator = document.createNodeIterator(clone, NodeFilter.SHOW_COMMENT);
            let currentNode;
            while ((currentNode = iterator.nextNode())) {
                currentNode.parentNode?.removeChild(currentNode);
            }

            // 3. Clean attributes and truncate text
            const walk = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            while (walk.nextNode()) {
                const node = walk.currentNode;

                if (node.nodeType === Node.ELEMENT_NODE) {
                    const el = node as HTMLElement;

                    // Remove mostly useless attributes for AI selection
                    const keepAttrs = [
                        'id',
                        'name',
                        'class',
                        'type',
                        'placeholder',
                        'aria-label',
                        'role',
                        'href',
                        'value',
                        'title',
                        'alt',
                    ];
                    // Also keep data-test attributes
                    Array.from(el.attributes).forEach(attr => {
                        const isDataTest = attr.name.startsWith('data-test');
                        if (!keepAttrs.includes(attr.name) && !isDataTest) {
                            el.removeAttribute(attr.name);
                        }
                    });

                    // Remove style attributes (noise)
                    el.removeAttribute('style');
                } else if (node.nodeType === Node.TEXT_NODE) {
                    // Truncate very long text nodes (e.g. legal text, huge paragraphs)
                    if (node.nodeValue && node.nodeValue.length > 200) {
                        node.nodeValue = node.nodeValue.substring(0, 200) + '...';
                    }
                }
            }

            return clone.outerHTML;
        });
    }
}
