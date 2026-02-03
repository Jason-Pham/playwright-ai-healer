import { type Page, test } from '@playwright/test';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config/index.js';
import { LocatorManager } from './utils/LocatorManager.js';
import { logger } from './utils/Logger.js';
import type { AIProvider, ClickOptions, FillOptions, AIError, HealingMetrics, HealingAttempt } from './types.js';

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

    private apiKeys: string[];
    private currentKeyIndex = 0;

    // Performance metrics tracking
    private healingAttempts: HealingAttempt[] = [];
    private metrics: HealingMetrics = {
        totalAttempts: 0,
        successfulHeals: 0,
        failedHeals: 0,
        totalLatencyMs: 0,
        averageLatencyMs: 0,
        successRate: 0,
        totalTokensUsed: 0,
    };

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
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting click on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.click(selector, { timeout: config.test.timeouts.short, ...options });
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
        const locatorManager = LocatorManager.getInstance();
        const selector = locatorManager.getLocator(selectorOrKey) || selectorOrKey;
        const locatorKey = locatorManager.getLocator(selectorOrKey) ? selectorOrKey : null;

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting fill on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.fill(selector, value, { timeout: config.test.timeouts.short, ...options });
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
     * Core healing logic - attempts to find a new selector using AI
     *
     * @param originalSelector - The selector that failed
     * @param error - The error that occurred
     * @returns New selector if healing succeeds, null otherwise
     * @private
     */
    private async heal(originalSelector: string, error: Error): Promise<string | null> {
        const startTime = Date.now();
        let success = false;
        let healedSelector: string | null = null;

        try {
            // 1. Capture simplified DOM
            const htmlSnapshot = await this.getSimplifiedDOM();

            // 2. Construct Prompt
            const promptText = config.ai.prompts.healingPrompt(
                originalSelector,
                error.message,
                htmlSnapshot.substring(0, 2000)
            );

            let result: string | undefined;

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
                } catch (reqError) {
                    const error = reqError as AIError;
                    const isRateLimit = error.message?.includes('429') || error.status === 429;
                    const isAuthError = error.message?.includes('401') || error.status === 401;

                    if (isRateLimit) {
                        logger.warn(`[AutoHealer] Rate limit (429) detected. Skipping test to avoid timeout.`);
                        test.info().annotations.push({
                            type: 'warning',
                            description: 'Test skipped due to AI Rate Limit (429)',
                        });
                        test.skip(true, 'Test skipped due to AI Rate Limit (429)');
                        return null; // Should not be reached effectively, but satisfies types
                    }

                    if (isAuthError) {
                        logger.warn(
                            `[AutoHealer] Auth Error (${error.status || 'Unknown'}). Attempting key rotation...`
                        );
                        const rotated = this.rotateKey();
                        if (rotated) {
                            continue; // Try next key
                        } else {
                            logger.error('[AutoHealer] No more API keys to try.');
                            throw error;
                        }
                    }
                    throw error;
                }
            }

            // Cleanup potential markdown code blocks if the model adds them
            if (result) {
                result = result.replace(/```/g, '').trim();
            }

            if (result && result !== 'FAIL') {
                success = true;
                healedSelector = result;
                return result;
            }
        } catch (aiError) {
            const error = aiError as Error;
            // If it's a skip error, re-throw it so Playwright skips the test
            if (error.message?.includes('Test skipped')) {
                throw error;
            }
            logger.error(`[AutoHealer] AI Healing failed (${this.provider}): ${error.message || String(error)}`);
        } finally {
            // Track metrics regardless of success/failure
            const latencyMs = Date.now() - startTime;
            this.recordHealingAttempt(originalSelector, success, latencyMs, healedSelector);
        }

        return null;
    }

    /**
     * Captures the DOM and removes noise (scripts, styles, SVGs) to save tokens
     *
     * @returns Simplified HTML string
     * @private
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

            while ((currentNode = iterator.nextNode())) {
                currentNode.parentNode?.removeChild(currentNode);
            }

            return clone.outerHTML;
        });
    }

    /**
     * Record a healing attempt for metrics tracking
     */
    private recordHealingAttempt(
        selector: string,
        success: boolean,
        latencyMs: number,
        healedSelector: string | null
    ): void {
        const attempt: HealingAttempt = {
            timestamp: new Date(),
            selector,
            success,
            latencyMs,
            provider: this.provider,
            error: success ? undefined : 'Healing failed',
        };

        this.healingAttempts.push(attempt);

        // Update metrics
        this.metrics.totalAttempts++;
        if (success) {
            this.metrics.successfulHeals++;
        } else {
            this.metrics.failedHeals++;
        }
        this.metrics.totalLatencyMs += latencyMs;
        this.metrics.averageLatencyMs = this.metrics.totalLatencyMs / this.metrics.totalAttempts;
        this.metrics.successRate =
            this.metrics.totalAttempts > 0 ? this.metrics.successfulHeals / this.metrics.totalAttempts : 0;

        // Log metrics if in debug mode
        if (this.debug) {
            logger.info(
                `[Metrics] Healing ${success ? 'SUCCESS' : 'FAILED'}: ${selector} → ${healedSelector || 'N/A'} (${latencyMs}ms)`
            );
            logger.info(
                `[Metrics] Success rate: ${(this.metrics.successRate * 100).toFixed(1)}% (${this.metrics.successfulHeals}/${this.metrics.totalAttempts})`
            );
        }
    }

    /**
     * Get current performance metrics
     * @returns HealingMetrics object with current statistics
     */
    public getMetrics(): HealingMetrics {
        return { ...this.metrics };
    }

    /**
     * Get all healing attempts history
     * @returns Array of healing attempts
     */
    public getHealingHistory(): HealingAttempt[] {
        return [...this.healingAttempts];
    }

    /**
     * Reset metrics (useful for testing or new test sessions)
     */
    public resetMetrics(): void {
        this.healingAttempts = [];
        this.metrics = {
            totalAttempts: 0,
            successfulHeals: 0,
            failedHeals: 0,
            totalLatencyMs: 0,
            averageLatencyMs: 0,
            successRate: 0,
            totalTokensUsed: 0,
        };
        if (this.debug) {
            logger.info('[Metrics] Performance metrics reset');
        }
    }

    /**
     * Log current metrics summary
     */
    public logMetricsSummary(): void {
        const m = this.metrics;
        logger.info('=== AutoHealer Performance Metrics ===');
        logger.info(`Total Healing Attempts: ${m.totalAttempts}`);
        logger.info(`Successful Heals: ${m.successfulHeals}`);
        logger.info(`Failed Heals: ${m.failedHeals}`);
        logger.info(`Success Rate: ${(m.successRate * 100).toFixed(2)}%`);
        logger.info(`Average Latency: ${m.averageLatencyMs.toFixed(2)}ms`);
        logger.info(`Total Latency: ${m.totalLatencyMs}ms`);
        logger.info(`AI Provider: ${this.provider}`);
        logger.info(`Model: ${this.modelName}`);
        logger.info('======================================');
    }
}
