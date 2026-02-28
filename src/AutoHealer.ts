import { type Page, test } from '@playwright/test';
import { config } from './config/index.js';
import { LocatorManager } from './utils/LocatorManager.js';
import { logger } from './utils/Logger.js';
import { DOMSimplifier } from './utils/DOMSimplifier.js';
import { createAIClient, type IAIClient } from './ai/AIClient.js';
import { RetryPolicy } from './ai/RetryPolicy.js';
import type { AIProvider, ClickOptions, FillOptions, HealingResult, HealingEvent } from './types.js';


/**
 * AutoHealer - Self-healing test automation agent
 *
 * Orchestrates Playwright page interactions with AI-powered self-healing.
 * When an interaction fails, uses AI to find a new selector and retries.
 *
 * Delegates to:
 * - {@link DOMSimplifier} for DOM capture and sanitization
 * - {@link IAIClient} for AI provider abstraction (Gemini/OpenAI)
 * - {@link RetryPolicy} for retry/backoff/key rotation logic
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
    private client: IAIClient & { reinitialize(apiKey: string): void };
    private retryPolicy: RetryPolicy;
    private debug: boolean;
    private provider: AIProvider;
    private healingEvents: HealingEvent[] = [];

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

        const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
        const firstKey = keys[0] ?? '';

        this.client = createAIClient(provider, firstKey, modelName);
        this.retryPolicy = new RetryPolicy(this.client, keys);
    }

    /**
     * Safe click method that attempts self-healing on failure
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
            } catch (e) {
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

                if (locatorKey) {
                    logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                    await locatorManager.updateLocator(locatorKey, result.selector);
                }
            } else {
                throw error;
            }
        }
    }

    /**
     * Safe hover method that attempts self-healing on failure
     */
    async hover(selectorOrKey: string, options?: { timeout?: number; force?: boolean; position?: { x: number; y: number } }) {
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
                    locatorManager.updateLocator(locatorKey, result.selector);
                }
            } else {
                throw error;
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
            await this.page.locator(selector).pressSequentially(text, { ...(options?.delay !== undefined && { delay: options.delay }), timeout: options?.timeout ?? config.test.timeouts.fill });
        } catch (error) {
            logger.warn(`[AutoHealer] Type failed. Initiating healing protocol (${this.provider})...`);
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await this.page.locator(result.selector).pressSequentially(text, options?.delay !== undefined ? { delay: options.delay } : {});

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
     * Safe selectOption method that attempts self-healing on failure
     */
    async selectOption(selectorOrKey: string, values: string | string[] | { value?: string; label?: string; index?: number }, options?: { timeout?: number; force?: boolean }) {
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting selectOption on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.selectOption(selector, values, { timeout: config.test.timeouts.click, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] SelectOption failed. Initiating healing protocol (${this.provider})...`);
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await this.page.selectOption(result.selector, values, options);

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
     * Safe check method that attempts self-healing on failure
     */
    async check(selectorOrKey: string, options?: { timeout?: number; force?: boolean; position?: { x: number; y: number } }) {
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
                    locatorManager.updateLocator(locatorKey, result.selector);
                }
            } else {
                throw error;
            }
        }
    }

    /**
     * Safe uncheck method that attempts self-healing on failure
     */
    async uncheck(selectorOrKey: string, options?: { timeout?: number; force?: boolean; position?: { x: number; y: number } }) {
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting uncheck on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.uncheck(selector, { timeout: config.test.timeouts.click, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] Uncheck failed. Initiating healing protocol (${this.provider})...`);
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await this.page.uncheck(result.selector, options);

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
     * Safe waitForSelector method that attempts self-healing on failure
     */
    async waitForSelector(selectorOrKey: string, options?: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number }) {
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting waitForSelector on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.waitForSelector(selector, { timeout: config.test.timeouts.default, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] WaitForSelector failed. Initiating healing protocol (${this.provider})...`);
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);
                await this.page.waitForSelector(result.selector, options ?? {});

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
     * Core healing logic - orchestrates DOM capture, AI query, and result processing.
     *
     * Delegates to:
     * - DOMSimplifier for DOM capture
     * - RetryPolicy for AI request with retry/rotation
     * - Inline result validation
     *
     * @param originalSelector - The selector that failed
     * @param error - The error that occurred
     * @returns HealingResult if healing succeeds, null otherwise
     */
    private async heal(originalSelector: string, error: Error): Promise<HealingResult | null> {
        const startTime = Date.now();
        logger.info(`[AutoHealer:heal] ========== HEALING START ==========`);
        logger.info(`[AutoHealer:heal] Selector: "${originalSelector}", Provider: ${this.provider}`);

        let healingSuccess = false;
        let healingResult: HealingResult | null = null;

        try {
            // 1. Capture simplified DOM
            logger.info(`[AutoHealer:heal] Step 1: Capturing simplified DOM...`);
            const htmlSnapshot = await DOMSimplifier.capture(this.page);
            logger.info(`[AutoHealer:heal] DOM snapshot: ${htmlSnapshot.length} chars`);

            // 2. Construct Prompt
            const promptText = config.ai.prompts.healingPrompt(
                originalSelector,
                error.message,
                htmlSnapshot.substring(0, 2000)
            );

            // 3. Query AI with retry/rotation
            logger.info(`[AutoHealer:heal] Step 3: Querying AI...`);
            const result = await this.retryPolicy.executeWithRetry(
                promptText,
                config.test.timeouts.default
            );

            // 4. Process result
            logger.info(`[AutoHealer:heal] Step 4: Processing result: "${result}"`);
            if (result) {
                const cleaned = result.replace(/```/g, '').trim();
                if (cleaned && cleaned !== 'FAIL') {
                    healingSuccess = true;
                    healingResult = {
                        selector: cleaned,
                        confidence: 1.0,
                        reasoning: 'AI found replacement selector.',
                        strategy: 'css',
                    };
                    logger.info(`[AutoHealer:heal] ✅ HEALING SUCCEEDED! New selector: "${cleaned}"`);
                } else {
                    logger.warn(`[AutoHealer:heal] ❌ HEALING FAILED. Result: "${result}"`);
                }
            } else {
                logger.warn(`[AutoHealer:heal] ❌ HEALING FAILED. No result.`);
            }
        } catch (aiError) {
            const aiErrorTyped = aiError as Error;
            logger.error(`[AutoHealer:heal] ❌ EXCEPTION: ${aiErrorTyped.message || String(aiErrorTyped)}`);
            // Re-throw skip errors so Playwright skips the test
            if (
                String(aiErrorTyped).includes('Test skipped') ||
                aiErrorTyped.message?.includes('Test skipped') ||
                aiErrorTyped.message?.includes('Test is skipped')
            ) {
                throw aiErrorTyped;
            }
            logger.error(`[AutoHealer:heal] Healing failed (${this.provider}): ${aiErrorTyped.message || String(aiErrorTyped)}`);
        } finally {
            const durationMs = Date.now() - startTime;
            logger.info(`[AutoHealer:heal] ========== HEALING END (${durationMs}ms) ==========`);
            logger.info(`[AutoHealer:heal] Success: ${healingSuccess}, Result: ${healingResult ? healingResult.selector : 'null'}`);
            this.healingEvents.push({
                timestamp: new Date().toISOString(),
                originalSelector,
                result: healingResult,
                error: healingSuccess ? '' : error.message,
                success: healingSuccess,
                provider: this.provider,
                durationMs,
            });
        }

        return healingResult;
    }
}
