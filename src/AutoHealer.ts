import { type Page, test } from '@playwright/test';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config/index.js';
import { LocatorManager } from './utils/LocatorManager.js';
import { HealingReporter } from './utils/HealingReporter.js';
import { logger } from './utils/Logger.js';
import type { AIProvider, ClickOptions, FillOptions, AIError, HealingResult, HealingEvent } from './types.js';

/**
 * AutoHealer - Self-healing test automation agent
 *
 * This class wraps Playwright page interactions and automatically attempts to heal
 * broken selectors using AI (OpenAI or Google Gemini) when interactions fail.
 * Returns structured results with confidence scoring and healing reports.
 *
 * @example
 * ```typescript
 * const healer = new AutoHealer(page, 'your-api-key', 'gemini');
 * await healer.click('#submit-button');
 * await healer.fill('#search-input', 'test query');
 * const events = healer.getHealingEvents(); // Access healing report
 * ```
 */
export class AutoHealer {
    private page: Page;
    private openai?: OpenAI;
    private gemini?: GoogleGenerativeAI;
    private debug: boolean;
    private provider: AIProvider;
    private modelName: string;
    private healingReporter: HealingReporter;

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
        this.healingReporter = new HealingReporter();

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
     * Get all recorded healing events for reporting
     */
    getHealingEvents(): readonly HealingEvent[] {
        return this.healingReporter.getEvents();
    }

    /**
     * Get the healing reporter instance
     */
    getHealingReporter(): HealingReporter {
        return this.healingReporter;
    }

    /**
     * Safe click method that attempts self-healing on failure
     *
     * @param selectorOrKey - CSS selector or locator key from locators.json
     * @param options - Playwright click options
     * @throws Error if healing fails or element still cannot be found
     */
    async click(selectorOrKey: string, options?: ClickOptions) {
        const { selector, locatorKey } = this.resolveSelector(selectorOrKey);

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting click on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.click(selector, { timeout: config.test.timeouts.short, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] Click failed. Initiating healing protocol (${this.provider})...`);
            const healResult = await this.heal(selector, error as Error);
            if (healResult) {
                logger.info(`[AutoHealer] Retrying with new selector: ${healResult.selector}`);
                await this.page.click(healResult.selector, options);
                this.updateLocatorIfKeyed(locatorKey, healResult.selector);
            } else {
                throw error;
            }
        }
    }

    /**
     * Safe fill method that attempts self-healing on failure
     *
     * @param selectorOrKey - CSS selector or locator key from locators.json
     * @param value - Text value to fill
     * @param options - Playwright fill options
     * @throws Error if healing fails or element still cannot be found
     */
    async fill(selectorOrKey: string, value: string, options?: FillOptions) {
        const { selector, locatorKey } = this.resolveSelector(selectorOrKey);

        try {
            if (this.debug) logger.info(`[AutoHealer] Attempting fill on: ${selector} (Key: ${locatorKey || 'N/A'})`);
            await this.page.fill(selector, value, { timeout: config.test.timeouts.short, ...options });
        } catch (error) {
            logger.warn(`[AutoHealer] Fill failed. Initiating healing protocol (${this.provider})...`);
            const healResult = await this.heal(selector, error as Error);
            if (healResult) {
                logger.info(`[AutoHealer] Retrying with new selector: ${healResult.selector}`);
                await this.page.fill(healResult.selector, value, options);
                this.updateLocatorIfKeyed(locatorKey, healResult.selector);
            } else {
                throw error;
            }
        }
    }

    /**
     * Resolve a selector key to its actual selector value
     */
    private resolveSelector(selectorOrKey: string): { selector: string; locatorKey: string | null } {
        const locatorManager = LocatorManager.getInstance();
        const resolved = locatorManager.getLocator(selectorOrKey);
        return {
            selector: resolved || selectorOrKey,
            locatorKey: resolved ? selectorOrKey : null,
        };
    }

    /**
     * Update locator in LocatorManager if the selector was resolved from a key
     */
    private updateLocatorIfKeyed(locatorKey: string | null, newSelector: string): void {
        if (locatorKey) {
            const locatorManager = LocatorManager.getInstance();
            logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
            locatorManager.updateLocator(locatorKey, newSelector);
        }
    }

    /**
     * Core healing logic - attempts to find a new selector using AI
     *
     * Returns a structured HealingResult with confidence scoring, or null if healing fails.
     *
     * @param originalSelector - The selector that failed
     * @param error - The error that occurred
     * @returns HealingResult if healing succeeds and confidence is above threshold, null otherwise
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

        try {
            let rawResult: string | undefined;

            const maxKeyRotations = this.apiKeys.length;

            // Outer loop for key rotation
            for (let k = 0; k < maxKeyRotations; k++) {
                try {
                    rawResult = await this.callAI(promptText);
                    break;
                } catch (reqError) {
                    const aiError = reqError as AIError;
                    const handled = this.handleAIError(aiError);
                    if (!handled) throw aiError;
                    // If handled (key rotated), continue to next iteration
                }
            }

            // Parse the structured JSON response
            const healingResult = this.parseHealingResponse(rawResult);

            if (healingResult && healingResult.confidence >= config.ai.healing.confidenceThreshold) {
                this.healingReporter.record({
                    timestamp: new Date().toISOString(),
                    originalSelector,
                    result: healingResult,
                    error: error.message,
                    success: true,
                    provider: this.provider,
                    durationMs: Date.now() - startTime,
                });
                return healingResult;
            }

            // Below confidence threshold or no result
            this.healingReporter.record({
                timestamp: new Date().toISOString(),
                originalSelector,
                result: healingResult,
                error: error.message,
                success: false,
                provider: this.provider,
                durationMs: Date.now() - startTime,
            });

            if (healingResult) {
                logger.warn(
                    `[AutoHealer] Healing rejected: confidence ${(healingResult.confidence * 100).toFixed(0)}% is below threshold ${(config.ai.healing.confidenceThreshold * 100).toFixed(0)}%`
                );
            }
        } catch (aiError) {
            const castError = aiError as Error;
            // If it's a skip error, re-throw it so Playwright skips the test
            if (castError.message?.includes('Test skipped')) {
                throw castError;
            }
            logger.error(`[AutoHealer] AI Healing failed (${this.provider}): ${castError.message || String(castError)}`);

            this.healingReporter.record({
                timestamp: new Date().toISOString(),
                originalSelector,
                result: null,
                error: castError.message || String(castError),
                success: false,
                provider: this.provider,
                durationMs: Date.now() - startTime,
            });
        }

        return null;
    }

    /**
     * Call the configured AI provider and return the raw text response
     */
    private async callAI(promptText: string): Promise<string | undefined> {
        if (this.provider === 'openai' && this.openai) {
            const completion = await this.openai.chat.completions.create({
                messages: [{ role: 'user', content: promptText }],
                model: this.modelName,
                response_format: { type: 'json_object' },
            });
            return completion.choices[0]?.message.content?.trim();
        } else if (this.provider === 'gemini' && this.gemini) {
            const model = this.gemini.getGenerativeModel({
                model: this.modelName,
                generationConfig: { responseMimeType: 'application/json' },
            });
            const result = await model.generateContent(promptText);
            return result.response.text().trim();
        }
        return undefined;
    }

    /**
     * Handle AI API errors (rate limits, auth errors)
     * @returns true if the error was handled (key rotated), false if it should be re-thrown
     */
    private handleAIError(error: AIError): boolean {
        const isRateLimit = error.message?.includes('429') || error.status === 429;
        const isAuthError = error.message?.includes('401') || error.status === 401;

        if (isRateLimit) {
            logger.warn(`[AutoHealer] Rate limit (429) detected. Skipping test to avoid timeout.`);
            test.info().annotations.push({
                type: 'warning',
                description: 'Test skipped due to AI Rate Limit (429)',
            });
            test.skip(true, 'Test skipped due to AI Rate Limit (429)');
            return true;
        }

        if (isAuthError) {
            logger.warn(`[AutoHealer] Auth Error (${error.status || 'Unknown'}). Attempting key rotation...`);
            const rotated = this.rotateKey();
            if (rotated) {
                return true; // Continue with next key
            }
            logger.error('[AutoHealer] No more API keys to try.');
            return false;
        }

        return false;
    }

    /**
     * Parse the AI response as structured JSON HealingResult
     */
    private parseHealingResponse(raw: string | undefined): HealingResult | null {
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;

            const selector = typeof parsed['selector'] === 'string' ? parsed['selector'] : '';
            const confidence = typeof parsed['confidence'] === 'number' ? parsed['confidence'] : 0;
            const reasoning = typeof parsed['reasoning'] === 'string' ? parsed['reasoning'] : '';
            const strategy = typeof parsed['strategy'] === 'string' ? parsed['strategy'] : 'css';

            if (!selector) return null;

            return {
                selector,
                confidence,
                reasoning,
                strategy: strategy as HealingResult['strategy'],
            };
        } catch {
            // Fallback: treat as raw selector string (backwards compatibility)
            const cleaned = raw.replace(/```/g, '').trim();
            if (cleaned && cleaned !== 'FAIL') {
                return {
                    selector: cleaned,
                    confidence: 0.5,
                    reasoning: 'Raw string response (no structured output)',
                    strategy: 'css',
                };
            }
            return null;
        }
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
                'script', 'style', 'svg', 'path', 'link', 'meta', 'noscript',
                'iframe', 'video', 'audio', 'object', 'embed'
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
                    const keepAttrs = ['id', 'name', 'class', 'type', 'placeholder', 'aria-label', 'role', 'href', 'value', 'title', 'alt'];
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
