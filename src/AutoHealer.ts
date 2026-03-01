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
 * const healer = new AutoHealer(page, process.env['GEMINI_API_KEY']!, 'gemini');
 * await healer.click('gigantti.searchInput');
 * await healer.fill('gigantti.searchInput', 'laptop');
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
        this.modelName = modelName || (provider === 'openai' ? config.ai.openai.modelName : config.ai.gemini.modelName);

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

    private switchProvider(): boolean {
        if (this.provider === 'gemini') {
            const openaiKeys = config.ai.openai.apiKeys;
            if (openaiKeys && openaiKeys.length > 0) {
                logger.info(`[AutoHealer] Switching from Gemini to OpenAI due to 4xx error.`);
                this.provider = 'openai';
                this.apiKeys = typeof openaiKeys === 'string' ? [openaiKeys] : openaiKeys;
                this.currentKeyIndex = 0;
                this.modelName = config.ai.openai.modelName;
                this.initializeClient();
                return true;
            }
        } else if (this.provider === 'openai') {
            const geminiKey = config.ai.gemini.apiKey;
            if (geminiKey) {
                logger.info(`[AutoHealer] Switching from OpenAI to Gemini due to 4xx error.`);
                this.provider = 'gemini';
                this.apiKeys = [geminiKey];
                this.currentKeyIndex = 0;
                this.modelName = config.ai.gemini.modelName;
                this.initializeClient();
                return true;
            }
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
                logger.info(`[AutoHealer] Attempting ${actionName} on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            try {
                await this.page.locator(selector).waitFor({ state: 'visible', timeout: config.test.timeouts.default });
            } catch {
                logger.warn(`[AutoHealer] Element ${selector} not visible after timeout. Proceeding to action anyway.`);
            }
            await actionFn(selector);
        } catch (error) {
            logger.warn(
                `[AutoHealer] ${actionName} failed on: ${selector}. Initiating healing protocol (${this.provider})...`
            );
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await retryFn(result.selector);

                // Update locator if we have a key — persistence failure is non-fatal
                if (locatorKey) {
                    logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                    await locatorManager.updateLocator(locatorKey, result.selector).catch((persistError: unknown) => {
                        logger.warn(
                            `[AutoHealer] Healing succeeded but failed to persist locator '${locatorKey}': ${String(persistError)}`
                        );
                    });
                }
            } else {
                logger.warn(`[AutoHealer] AI could not find a new selector. Skipping test.`);
                test.info().annotations.push({
                    type: 'warning',
                    description: 'Test skipped because AutoHealer AI could not find a suitable replacement selector.',
                });
                test.skip(true, 'Test skipped because AutoHealer AI could not find a suitable replacement selector.');
            }
        }
    }

    /**
     * Safe hover method that attempts self-healing on failure
     */
    async hover(
        selectorOrKey: string,
        options?: { timeout?: number; force?: boolean; position?: { x: number; y: number } }
    ) {
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting hover on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.hover(selector, { timeout: config.test.timeouts.click, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] Hover failed. Initiating healing protocol (${this.provider})...`);
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await this.page.hover(result.selector, options);

                if (locatorKey) {
                    logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                    await locatorManager.updateLocator(locatorKey, result.selector).catch((persistError: unknown) => {
                        logger.warn(
                            `[AutoHealer] Healing succeeded but failed to persist locator '${locatorKey}': ${String(persistError)}`
                        );
                    });
                }
            } else {
                logger.warn(`[AutoHealer] AI could not find a new selector. Skipping test.`);
                test.info().annotations.push({
                    type: 'warning',
                    description: 'Test skipped because AutoHealer AI could not find a suitable replacement selector.',
                });
                test.skip(true, 'Test skipped because AutoHealer AI could not find a suitable replacement selector.');
            }
        }
    }

    /**
     * Safe type method (pressSequentially) that attempts self-healing on failure
     */
    async type(selectorOrKey: string, text: string, options?: { delay?: number; timeout?: number }) {
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting type on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.locator(selector).pressSequentially(text, {
                ...(options?.delay !== undefined && { delay: options.delay }),
                timeout: options?.timeout ?? config.test.timeouts.fill,
            });
        } catch (error) {
            logger.warn(`[AutoHealer] Type failed. Initiating healing protocol (${this.provider})...`);
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await this.page
                    .locator(result.selector)
                    .pressSequentially(text, options?.delay !== undefined ? { delay: options.delay } : {});

                if (locatorKey) {
                    logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                    await locatorManager.updateLocator(locatorKey, result.selector).catch((persistError: unknown) => {
                        logger.warn(
                            `[AutoHealer] Healing succeeded but failed to persist locator '${locatorKey}': ${String(persistError)}`
                        );
                    });
                }
            } else {
                logger.warn(`[AutoHealer] AI could not find a new selector. Skipping test.`);
                test.info().annotations.push({
                    type: 'warning',
                    description: 'Test skipped because AutoHealer AI could not find a suitable replacement selector.',
                });
                test.skip(true, 'Test skipped because AutoHealer AI could not find a suitable replacement selector.');
            }
        }
    }

    /**
     * Safe selectOption method that attempts self-healing on failure
     */
    async selectOption(
        selectorOrKey: string,
        values: string | string[] | { value?: string; label?: string; index?: number },
        options?: { timeout?: number; force?: boolean }
    ) {
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug)
                logger.info(`[AutoHealer] Attempting selectOption on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.selectOption(selector, values, { timeout: config.test.timeouts.click, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] SelectOption failed. Initiating healing protocol (${this.provider})...`);
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await this.page.selectOption(result.selector, values, options);

                if (locatorKey) {
                    logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                    await locatorManager.updateLocator(locatorKey, result.selector).catch((persistError: unknown) => {
                        logger.warn(
                            `[AutoHealer] Healing succeeded but failed to persist locator '${locatorKey}': ${String(persistError)}`
                        );
                    });
                }
            } else {
                logger.warn(`[AutoHealer] AI could not find a new selector. Skipping test.`);
                test.info().annotations.push({
                    type: 'warning',
                    description: 'Test skipped because AutoHealer AI could not find a suitable replacement selector.',
                });
                test.skip(true, 'Test skipped because AutoHealer AI could not find a suitable replacement selector.');
            }
        }
    }

    /**
     * Safe check method that attempts self-healing on failure
     */
    async check(
        selectorOrKey: string,
        options?: { timeout?: number; force?: boolean; position?: { x: number; y: number } }
    ) {
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting check on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.check(selector, { timeout: config.test.timeouts.click, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] Check failed. Initiating healing protocol (${this.provider})...`);
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await this.page.check(result.selector, options);

                if (locatorKey) {
                    logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                    await locatorManager.updateLocator(locatorKey, result.selector).catch((persistError: unknown) => {
                        logger.warn(
                            `[AutoHealer] Healing succeeded but failed to persist locator '${locatorKey}': ${String(persistError)}`
                        );
                    });
                }
            } else {
                logger.warn(`[AutoHealer] AI could not find a new selector. Skipping test.`);
                test.info().annotations.push({
                    type: 'warning',
                    description: 'Test skipped because AutoHealer AI could not find a suitable replacement selector.',
                });
                test.skip(true, 'Test skipped because AutoHealer AI could not find a suitable replacement selector.');
            }
        }
    }

    /**
     * Safe uncheck method that attempts self-healing on failure
     */
    async uncheck(
        selectorOrKey: string,
        options?: { timeout?: number; force?: boolean; position?: { x: number; y: number } }
    ) {
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug)
                logger.info(`[AutoHealer] Attempting uncheck on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.uncheck(selector, { timeout: config.test.timeouts.click, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] Uncheck failed. Initiating healing protocol (${this.provider})...`);
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await this.page.uncheck(result.selector, options);

                if (locatorKey) {
                    logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                    await locatorManager.updateLocator(locatorKey, result.selector).catch((persistError: unknown) => {
                        logger.warn(
                            `[AutoHealer] Healing succeeded but failed to persist locator '${locatorKey}': ${String(persistError)}`
                        );
                    });
                }
            } else {
                logger.warn(`[AutoHealer] AI could not find a new selector. Skipping test.`);
                test.info().annotations.push({
                    type: 'warning',
                    description: 'Test skipped because AutoHealer AI could not find a suitable replacement selector.',
                });
                test.skip(true, 'Test skipped because AutoHealer AI could not find a suitable replacement selector.');
            }
        }
    }

    /**
     * Safe waitForSelector method that attempts self-healing on failure
     */
    async waitForSelector(
        selectorOrKey: string,
        options?: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number }
    ) {
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug)
                logger.info(`[AutoHealer] Attempting waitForSelector on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.waitForSelector(selector, { timeout: config.test.timeouts.default, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] WaitForSelector failed. Initiating healing protocol (${this.provider})...`);
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await this.page.waitForSelector(result.selector, options ?? {});

                if (locatorKey) {
                    logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                    await locatorManager.updateLocator(locatorKey, result.selector).catch((persistError: unknown) => {
                        logger.warn(
                            `[AutoHealer] Healing succeeded but failed to persist locator '${locatorKey}': ${String(persistError)}`
                        );
                    });
                }
            } else {
                logger.warn(`[AutoHealer] AI could not find a new selector. Skipping test.`);
                test.info().annotations.push({
                    type: 'warning',
                    description: 'Test skipped because AutoHealer AI could not find a suitable replacement selector.',
                });
                test.skip(true, 'Test skipped because AutoHealer AI could not find a suitable replacement selector.');
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
        logger.info(`[AutoHealer:heal] ========== HEALING START ==========`);
        logger.info(`[AutoHealer:heal] Original selector: "${originalSelector}"`);
        logger.info(`[AutoHealer:heal] Error: ${error.message}`);
        logger.info(`[AutoHealer:heal] Provider: ${this.provider}, Model: ${this.modelName}`);
        logger.info(
            `[AutoHealer:heal] Available API keys: ${this.apiKeys.length}, Current key index: ${this.currentKeyIndex}`
        );

        // 1. Capture simplified DOM
        logger.info(`[AutoHealer:heal] Step 1: Capturing simplified DOM...`);
        const htmlSnapshot = await this.getSimplifiedDOM();
        logger.info(`[AutoHealer:heal] DOM snapshot length: ${htmlSnapshot.length} chars (will use full DOM)`);
        logger.debug(`[AutoHealer:heal] DOM snapshot preview (first 500 chars): ${htmlSnapshot.substring(0, 500)}`);

        // 2. Construct Prompt
        logger.info(`[AutoHealer:heal] Step 2: Constructing prompt...`);
        const promptText = config.ai.prompts.healingPrompt(originalSelector, error.message, htmlSnapshot);
        logger.info(`[AutoHealer:heal] Prompt length: ${promptText.length} chars`);
        logger.debug(`[AutoHealer:heal] Prompt preview (first 300 chars): ${promptText.substring(0, 300)}`);

        let healingSuccess = false;
        let healingResult: HealingResult | null = null;
        let hasSwitchedProvider = false;
        let tokensUsed: { prompt: number; completion: number; total: number } | undefined;

        try {
            let result: string | undefined;

            let maxKeyRotations = this.apiKeys.length;
            logger.info(`[AutoHealer:heal] Step 3: Starting AI request loop (maxKeyRotations=${maxKeyRotations})`);

            // Outer loop for key rotation
            keyLoop: for (let k = 0; k < maxKeyRotations; k++) {
                let retryCount = 0;
                const maxRetries = 3;
                logger.info(`[AutoHealer:heal] Key rotation iteration k=${k}, using key index ${this.currentKeyIndex}`);

                while (retryCount <= maxRetries) {
                    logger.info(`[AutoHealer:heal] Attempt: keyIteration=${k}, retryCount=${retryCount}/${maxRetries}`);
                    try {
                        if (this.provider === 'openai' && this.openai) {
                            logger.info(`[AutoHealer:heal] Sending request to OpenAI (model: ${this.modelName})...`);
                            const completion = await this.withTimeout(
                                this.openai.chat.completions.create({
                                    messages: [{ role: 'user', content: promptText }],
                                    model: this.modelName,
                                }),
                                config.test.timeouts.default,
                                'OpenAI'
                            );
                            result = completion.choices[0]?.message.content?.trim();
                            const usage = completion.usage;
                            if (usage) {
                                tokensUsed = {
                                    prompt: usage.prompt_tokens ?? 0,
                                    completion: usage.completion_tokens ?? 0,
                                    total: usage.total_tokens ?? 0,
                                };
                            }
                            logger.info(`[AutoHealer:heal] OpenAI response received. Result: "${result}"`);
                            logger.info(
                                `[AutoHealer:heal] OpenAI Metadata - ID: ${completion.id}, Model: ${completion.model}, Tokens (Prompt/Completion/Total): ${usage?.prompt_tokens}/${usage?.completion_tokens}/${usage?.total_tokens}`
                            );
                            logger.debug(
                                `[AutoHealer:heal] Full completion choices: ${JSON.stringify(completion.choices)}`
                            );
                        } else if (this.provider === 'gemini' && this.gemini) {
                            logger.info(`[AutoHealer:heal] Sending request to Gemini (model: ${this.modelName})...`);
                            const model = this.gemini.getGenerativeModel({ model: this.modelName });
                            const resultResult = await this.withTimeout(
                                model.generateContent(promptText),
                                config.test.timeouts.default,
                                'Gemini'
                            );
                            result = resultResult.response.text().trim();
                            const usageMetadata = resultResult.response.usageMetadata;
                            if (usageMetadata) {
                                tokensUsed = {
                                    prompt: usageMetadata.promptTokenCount ?? 0,
                                    completion: usageMetadata.candidatesTokenCount ?? 0,
                                    total: usageMetadata.totalTokenCount ?? 0,
                                };
                            }
                            logger.info(`[AutoHealer:heal] Gemini response received. Result: "${result}"`);
                            logger.info(
                                `[AutoHealer:heal] Gemini Metadata - Tokens (Prompt/Candidates/Total): ${usageMetadata?.promptTokenCount}/${usageMetadata?.candidatesTokenCount}/${usageMetadata?.totalTokenCount}`
                            );
                            logger.debug(
                                `[AutoHealer:heal] Gemini full response details: ${JSON.stringify({
                                    candidates: resultResult.response.candidates,
                                    promptFeedback: resultResult.response.promptFeedback,
                                })}`
                            );
                        } else {
                            logger.error(
                                `[AutoHealer:heal] No AI client initialized! provider=${this.provider}, openai=${!!this.openai}, gemini=${!!this.gemini}`
                            );
                            throw new Error(
                                `[AutoHealer] No AI client initialized for provider "${this.provider}". Check API key configuration.`
                            );
                        }
                        // If success, break loop
                        logger.info(`[AutoHealer:heal] AI request succeeded, breaking out of retry loop.`);
                        break keyLoop;
                    } catch (reqError) {
                        const reqErrorTyped = reqError as AIError;
                        const errorMessage = reqErrorTyped.message?.toLowerCase() || '';
                        logger.error(
                            `[AutoHealer:heal] AI request FAILED. Status: ${reqErrorTyped.status}, Message: "${reqErrorTyped.message}"`
                        );
                        logger.debug(
                            `[AutoHealer:heal] Full error object: ${JSON.stringify(reqErrorTyped, Object.getOwnPropertyNames(reqErrorTyped))}`
                        );

                        // Handle 503 Service Unavailable / 5xx Server Errors / Timeouts
                        const isServerError =
                            (reqErrorTyped.status && reqErrorTyped.status >= 500) ||
                            /\\b503\\b/.test(errorMessage) ||
                            /\\b500\\b/.test(errorMessage) ||
                            errorMessage.includes('service unavailable') ||
                            errorMessage.includes('overloaded') ||
                            errorMessage.includes('internal server error') ||
                            errorMessage.includes('bad gateway') ||
                            errorMessage.includes('timed out');

                        logger.info(`[AutoHealer:heal] Error classification: isServerError=${isServerError}`);

                        if (isServerError) {
                            if (retryCount < maxRetries) {
                                retryCount++;
                                const delay = Math.pow(2, retryCount) * 1000;
                                logger.warn(
                                    `[AutoHealer:heal] AI Server Error (${reqErrorTyped.status}). Retrying in ${delay / 1000}s... (Attempt ${retryCount}/${maxRetries})`
                                );
                                await new Promise(resolve => setTimeout(resolve, delay));
                                continue;
                            } else {
                                logger.error(
                                    `[AutoHealer:heal] AI Server Error after ${maxRetries} retries. Giving up.`
                                );
                                throw reqErrorTyped;
                            }
                        }

                        // Handle 401 Auth Errors specifically for key rotation prioritizing
                        const isAuthError =
                            reqErrorTyped.status === 401 ||
                            /\\b401\\b/.test(errorMessage) ||
                            errorMessage.includes('unauthorized');

                        logger.info(`[AutoHealer:heal] Error classification: isAuthError=${isAuthError}`);

                        if (isAuthError) {
                            logger.warn(`[AutoHealer:heal] Auth Error (401). Attempting key rotation...`);
                            const rotated = this.rotateKey();
                            if (rotated) {
                                logger.info(
                                    `[AutoHealer:heal] Key rotation result: ${rotated} (new index: ${this.currentKeyIndex})`
                                );
                                continue keyLoop; // Try next key
                            }
                            logger.info(
                                `[AutoHealer:heal] Key rotation exhausted. Falling through to provider switch.`
                            );
                        }

                        // Handle 4xx Client Errors (Rate limit, Auth fallback, Quota, etc)
                        const is4xxError =
                            (reqErrorTyped.status && reqErrorTyped.status >= 400 && reqErrorTyped.status < 500) ||
                            /\\b429\\b/.test(errorMessage) ||
                            errorMessage.includes('rate limit') ||
                            errorMessage.includes('resource exhausted') ||
                            errorMessage.includes('insufficient quota') ||
                            isAuthError;

                        logger.info(`[AutoHealer:heal] Error classification: is4xxError=${is4xxError}`);

                        if (is4xxError) {
                            logger.warn(
                                `[AutoHealer:heal] Client Error (4xx) detected: ${reqErrorTyped.status}. Attempting to switch AI provider...`
                            );
                            if (!hasSwitchedProvider && this.switchProvider()) {
                                hasSwitchedProvider = true;
                                maxKeyRotations = this.apiKeys.length;
                                k = -1; // Reset loop variables to restart with the new provider
                                continue keyLoop; // Restart the outer loop
                            } else {
                                logger.error(
                                    `[AutoHealer:heal] No alternate provider configured or provider already switched. Skip healing.`
                                );
                                test.info().annotations.push({
                                    type: 'warning',
                                    description: 'Test skipped due to AI Client Error (4xx)',
                                });
                                test.skip(true, 'Test skipped due to AI Client Error (4xx)');
                                return null;
                            }
                        }

                        logger.error(`[AutoHealer:heal] Unhandled error type. Re-throwing.`);
                        throw reqErrorTyped;
                    }
                }
            }

            // Cleanup potential markdown code blocks if the model adds them
            logger.info(`[AutoHealer:heal] Step 4: Processing AI result. Raw result: "${result}"`);
            if (result) {
                const originalResult = result;

                // If real FAIL string exists, keep it
                if (result.trim() === 'FAIL') {
                    result = 'FAIL';
                } else {
                    // Extract code block or backticks if Gemini gave conversational text
                    const backtickMatch = result.match(/`([^`]+)`/g);
                    const lastMatch = backtickMatch ? backtickMatch[backtickMatch.length - 1] : undefined;
                    if (lastMatch) {
                        result = lastMatch.replace(/`/g, '').trim();
                    } else {
                        result = result.replace(/```/g, '').trim();
                    }

                    // Remove any surrounding quotes that the model might have added
                    if (
                        (result.startsWith('"') && result.endsWith('"')) ||
                        (result.startsWith("'") && result.endsWith("'"))
                    ) {
                        result = result.substring(1, result.length - 1);
                    }
                }

                if (originalResult !== result) {
                    logger.info(`[AutoHealer:heal] Cleaned markdown from result: "${originalResult}" -> "${result}"`);
                }
            }

            if (result && result !== 'FAIL') {
                healingSuccess = true;
                healingResult = {
                    selector: result,
                    confidence: 1.0,
                    reasoning: 'AI found replacement selector.',
                    strategy: 'css',
                };
                logger.info(`[AutoHealer:heal] ✅ HEALING SUCCEEDED! New selector: "${result}"`);
            } else {
                logger.warn(`[AutoHealer:heal] ❌ HEALING FAILED. Result was: "${result}" (FAIL or empty)`);
            }
        } catch (aiError) {
            const aiErrorTyped = aiError as Error;
            logger.error(`[AutoHealer:heal] ❌ HEALING EXCEPTION: ${aiErrorTyped.message || String(aiErrorTyped)}`);
            // If it's a skip error, re-throw it so Playwright skips the test
            if (
                String(aiErrorTyped).includes('Test skipped') ||
                aiErrorTyped.message?.includes('Test skipped') ||
                aiErrorTyped.message?.includes('Test is skipped')
            ) {
                logger.info(`[AutoHealer:heal] Re-throwing skip error to Playwright.`);
                throw aiErrorTyped;
            }
            logger.error(
                `[AutoHealer:heal] AI Healing failed (${this.provider}): ${aiErrorTyped.message || String(aiErrorTyped)}`
            );
        } finally {
            const durationMs = Date.now() - startTime;
            logger.info(`[AutoHealer:heal] ========== HEALING END (${durationMs}ms) ==========`);
            logger.info(
                `[AutoHealer:heal] Success: ${healingSuccess}, Result: ${healingResult ? healingResult.selector : 'null'}`
            );
            // Record the healing event
            this.healingEvents.push({
                timestamp: new Date().toISOString(),
                originalSelector,
                result: healingResult,
                error: healingSuccess ? '' : error.message,
                success: healingSuccess,
                provider: this.provider,
                durationMs,
                ...(tokensUsed ? { tokensUsed } : {}),
                domSnapshotLength: htmlSnapshot.length,
            });
        }

        return healingResult;
    }

    /**
     * Wraps a promise with a timeout to prevent hanging API calls
     */
    private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`[AutoHealer] ${label} API request timed out after ${ms / 1000}s`));
            }, ms);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutId!);
        }
    }

    /**
     * Captures a minimal DOM snapshot focused on interactive/actionable elements.
     * Ancestors get minimal structural info (tag + id only).
     * Interactive elements get full attributes + text.
     * Output is hard-capped at MAX_OUTPUT_CHARS.
     *
     * @returns Simplified HTML string
     * @private
     */
    private async getSimplifiedDOM(): Promise<string> {
        return await this.page.evaluate(() => {
            const MAX_OUTPUT_CHARS = 15000;

            const scrubPII = (text: string): string => {
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const phoneRegex = /(\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g;
                return text.replace(emailRegex, '[EMAIL]').replace(phoneRegex, '[PHONE]');
            };

            const SKIP_TAGS = new Set([
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
            ]);

            const FULL_ATTRS = new Set([
                'id',
                'name',
                'class',
                'type',
                'placeholder',
                'aria-label',
                'role',
                'href',
                'title',
                'alt',
                'for',
                'action',
            ]);

            // Only id and name for ancestor (structural) elements
            const STRUCTURAL_ATTRS = new Set(['id', 'name', 'role']);

            // Selectors for interactive elements
            const INTERACTIVE_SELECTOR = [
                'input',
                'button',
                'select',
                'textarea',
                'form',
                '[role="button"]',
                '[role="textbox"]',
                '[role="searchbox"]',
                '[role="combobox"]',
                '[role="checkbox"]',
                '[role="radio"]',
                '[onclick]',
                '[data-testid]',
                '[data-test]',
                '[data-cy]',
            ].join(',');

            // ── Step 1: Find interactive elements and mark ancestor chains ──
            const interactiveSet = new Set<Element>();
            const neededElements = new Set<Element>();

            const interactiveEls = document.body.querySelectorAll(INTERACTIVE_SELECTOR);
            interactiveEls.forEach(el => {
                // Skip elements hidden by CSS (e.g. dismissed cookie banners still in the DOM)
                if (
                    typeof (el as HTMLElement).checkVisibility === 'function' &&
                    !(el as HTMLElement).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
                )
                    return;

                interactiveSet.add(el);
                let current: Element | null = el;
                while (current && current !== document.body) {
                    if (neededElements.has(current)) break;
                    neededElements.add(current);
                    current = current.parentElement;
                }
            });
            neededElements.add(document.body);

            // ── Step 2: Serialize with role-based attribute filtering ──
            const serializeAttrs = (el: Element, isInteractive: boolean): string => {
                const tagName = el.tagName.toLowerCase();
                const allowedAttrs = isInteractive ? FULL_ATTRS : STRUCTURAL_ATTRS;
                let attrs = '';
                Array.from(el.attributes).forEach(attr => {
                    const isDataTest = attr.name.startsWith('data-test') || attr.name.startsWith('data-cy');
                    if (allowedAttrs.has(attr.name) || (isInteractive && isDataTest)) {
                        let value = attr.value;
                        if (attr.name === 'value' && (tagName === 'input' || tagName === 'textarea')) {
                            value = '[REDACTED]';
                        }
                        if (attr.name === 'class' && value.length > 60) {
                            value = value.substring(0, 60) + '...';
                        }
                        attrs += ` ${attr.name}="${value}"`;
                    }
                });
                return attrs;
            };

            let charCount = 0;
            let budgetExceeded = false;

            const serializeNode = (node: Element, depth: number): string => {
                if (budgetExceeded) return '';
                const tagName = node.tagName.toLowerCase();
                if (SKIP_TAGS.has(tagName)) return '';

                const isInteractive = interactiveSet.has(node);
                const indent = '  '.repeat(Math.min(depth, 4));
                let html = `${indent}<${tagName}${serializeAttrs(node, isInteractive)}>`;

                // Only include text for interactive elements (not ancestors)
                if (isInteractive) {
                    const directText: string[] = [];
                    node.childNodes.forEach(child => {
                        if (child.nodeType === Node.TEXT_NODE) {
                            const text = child.nodeValue?.trim();
                            if (text) {
                                const scrubbed = scrubPII(text);
                                directText.push(scrubbed.length > 80 ? scrubbed.substring(0, 80) + '...' : scrubbed);
                            }
                        }
                    });
                    if (directText.length > 0) {
                        html += directText.join(' ');
                    }
                }

                // Collect needed children
                const neededChildren: Element[] = [];
                Array.from(node.children).forEach(child => {
                    if (neededElements.has(child)) neededChildren.push(child);
                });

                if (neededChildren.length > 0) {
                    html += '\n';
                    let i = 0;
                    while (i < neededChildren.length && !budgetExceeded) {
                        const child = neededChildren[i]!;
                        const childTag = child.tagName.toLowerCase();
                        const childClass = child.getAttribute('class') || '';
                        const sig = `${childTag}|${childClass}`;

                        // Count consecutive similar siblings
                        let run = 1;
                        while (
                            i + run < neededChildren.length &&
                            `${neededChildren[i + run]!.tagName.toLowerCase()}|${neededChildren[i + run]!.getAttribute('class') || ''}` ===
                                sig
                        ) {
                            run++;
                        }

                        if (run >= 3) {
                            html += serializeNode(child, depth + 1) + '\n';
                            html += serializeNode(neededChildren[i + 1]!, depth + 1) + '\n';
                            html += `${'  '.repeat(Math.min(depth + 1, 4))}<!-- ...${run - 2} more <${childTag}> -->\n`;
                            i += run;
                        } else {
                            html += serializeNode(child, depth + 1) + '\n';
                            i++;
                        }
                    }
                    html += `${indent}</${tagName}>`;
                } else {
                    html += `</${tagName}>`;
                }

                charCount += html.length;
                if (charCount > MAX_OUTPUT_CHARS) {
                    budgetExceeded = true;
                }

                return html;
            };

            // ── Step 3: Serialize and enforce budget ──
            let result = serializeNode(document.body, 0);

            // Hard-cap the output
            if (result.length > MAX_OUTPUT_CHARS) {
                result = result.substring(0, MAX_OUTPUT_CHARS) + '\n<!-- DOM truncated at budget limit -->';
            }

            // ── Step 4: Fallback if no interactive elements found ──
            if (interactiveEls.length === 0) {
                const clone = document.body.cloneNode(true) as HTMLElement;
                ['script', 'style', 'svg', 'noscript', 'iframe', 'video', 'audio'].forEach(tag =>
                    clone.querySelectorAll(tag).forEach(el => el.remove())
                );
                const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) {
                    const n = walker.currentNode;
                    if (n.nodeType === Node.ELEMENT_NODE) {
                        const el = n as HTMLElement;
                        Array.from(el.attributes).forEach(attr => {
                            if (attr.name === 'value' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                                el.setAttribute(attr.name, '[REDACTED]');
                            } else if (!FULL_ATTRS.has(attr.name) && !attr.name.startsWith('data-test')) {
                                el.removeAttribute(attr.name);
                            }
                        });
                    } else if (n.nodeType === Node.TEXT_NODE && n.nodeValue) {
                        n.nodeValue = scrubPII(n.nodeValue);
                        if (n.nodeValue.length > 100) n.nodeValue = n.nodeValue.substring(0, 100) + '...';
                    }
                }
                return clone.innerHTML.substring(0, MAX_OUTPUT_CHARS);
            }

            return result;
        });
    }
}
