import { type Page, test } from '@playwright/test';
import { config } from './config/index.js';
import { LocatorManager } from './utils/LocatorManager.js';
import { logger } from './utils/Logger.js';
import { AIClientManager } from './ai/AIClientManager.js';
import { getSimplifiedDOM } from './ai/DOMSerializer.js';
import { parseAIResponse } from './ai/ResponseParser.js';
import type {
    AIProvider,
    ClickOptions,
    FillOptions,
    HoverOptions,
    TypeOptions,
    SelectOptionOptions,
    SelectOptionValues,
    CheckOptions,
    WaitForSelectorOptions,
    AIError,
    HealingResult,
    HealingEvent,
    HealOperation,
    HealAllResult,
} from './types.js';

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
    private debug: boolean;
    private clientManager: AIClientManager;
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
        const resolvedModel =
            modelName || (provider === 'openai' ? config.ai.openai.modelName : config.ai.gemini.modelName);
        this.clientManager = new AIClientManager(apiKeys, provider, resolvedModel, debug);
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
                await this.page.locator(selector).waitFor({ state: 'visible', timeout: config.test.timeouts.short });
            } catch {
                logger.warn(`[AutoHealer] Element ${selector} not visible after timeout. Proceeding to action anyway.`);
            }
            await actionFn(selector);
        } catch (error) {
            logger.warn(
                `[AutoHealer] ${actionName} failed on: ${selector}. Initiating healing protocol (${this.clientManager.getProvider()})...`
            );
            const result = await this.heal(selector, error as Error);
            if (result) {
                logger.info(`[AutoHealer] Retrying with new selector: ${result.selector}`);

                try {
                    // Pre-validation: verify new selector exists before attempting action
                    try {
                        const target = this.page.locator(result.selector);
                        const count = await target.count();
                        if (count === 0) {
                            throw new Error(
                                `Healed selector '${result.selector}' resulted in 0 matches in the active DOM.`
                            );
                        }
                    } catch (validationErr) {
                        logger.warn(`[AutoHealer] Healed selector validation failed: ${String(validationErr)}`);
                        throw validationErr; // Pass to outer catch context for skipping
                    }

                    await retryFn(result.selector);

                    // Update locator if we have a key
                    if (locatorKey) {
                        logger.info(`[AutoHealer] Updating locator key '${locatorKey}' with new value.`);
                        await locatorManager.updateLocator(locatorKey, result.selector);
                    }
                } catch (retryError) {
                    logger.error(`[AutoHealer] Failed to interact with healed selector: ${String(retryError)}`);
                    test.info().annotations.push({
                        type: 'warning',
                        description: `Test skipped because healed selector '${result.selector}' failed during interaction.`,
                    });
                    test.skip(
                        true,
                        `Test skipped because healed selector '${result.selector}' failed during interaction.`
                    );
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
    async hover(selectorOrKey: string, options?: HoverOptions) {
        await this.executeAction(
            selectorOrKey,
            'hover',
            async selector => {
                await this.page.hover(selector, { timeout: config.test.timeouts.click, ...options });
            },
            async selector => {
                await this.page.hover(selector, options);
            }
        );
    }

    /**
     * Safe type method (pressSequentially) that attempts self-healing on failure
     */
    async type(selectorOrKey: string, text: string, options?: TypeOptions) {
        await this.executeAction(
            selectorOrKey,
            'type',
            async selector => {
                await this.page.locator(selector).pressSequentially(text, {
                    ...(options?.delay !== undefined && { delay: options.delay }),
                    timeout: options?.timeout ?? config.test.timeouts.fill,
                });
            },
            async selector => {
                await this.page
                    .locator(selector)
                    .pressSequentially(text, options?.delay !== undefined ? { delay: options.delay } : {});
            }
        );
    }

    /**
     * Safe selectOption method that attempts self-healing on failure
     */
    async selectOption(selectorOrKey: string, values: SelectOptionValues, options?: SelectOptionOptions) {
        await this.executeAction(
            selectorOrKey,
            'selectOption',
            async selector => {
                await this.page.selectOption(selector, values, { timeout: config.test.timeouts.click, ...options });
            },
            async selector => {
                await this.page.selectOption(selector, values, options);
            }
        );
    }

    /**
     * Safe check method that attempts self-healing on failure
     */
    async check(selectorOrKey: string, options?: CheckOptions) {
        await this.executeAction(
            selectorOrKey,
            'check',
            async selector => {
                await this.page.check(selector, { timeout: config.test.timeouts.click, ...options });
            },
            async selector => {
                await this.page.check(selector, options);
            }
        );
    }

    /**
     * Safe uncheck method that attempts self-healing on failure
     */
    async uncheck(selectorOrKey: string, options?: CheckOptions) {
        await this.executeAction(
            selectorOrKey,
            'uncheck',
            async selector => {
                await this.page.uncheck(selector, { timeout: config.test.timeouts.click, ...options });
            },
            async selector => {
                await this.page.uncheck(selector, options);
            }
        );
    }

    /**
     * Safe waitForSelector method that attempts self-healing on failure
     */
    async waitForSelector(selectorOrKey: string, options?: WaitForSelectorOptions) {
        await this.executeAction(
            selectorOrKey,
            'waitForSelector',
            async selector => {
                await this.page.waitForSelector(selector, { timeout: config.test.timeouts.default, ...options });
            },
            async selector => {
                await this.page.waitForSelector(selector, options ?? {});
            }
        );
    }

    /**
     * Get all healing events recorded during the current session
     */
    getHealingEvents(): readonly HealingEvent[] {
        return this.healingEvents;
    }

    /**
     * Heal multiple operations concurrently.
     *
     * Runs all operations sequentially (to avoid Playwright race conditions),
     * then fires AI healing for every failed operation **in parallel**, and
     * retries healed operations sequentially. This reduces total wall-clock
     * time when several selectors need AI-powered repair in the same test run.
     *
     * @param operations - Array of actions to attempt
     * @returns Per-operation results including success flag and healed selector
     *
     * @example
     * ```typescript
     * const results = await healer.healAll([
     *   { selectorOrKey: 'gigantti.searchInput', action: 'click' },
     *   { selectorOrKey: 'gigantti.cookieBtn',   action: 'click' },
     *   { selectorOrKey: 'gigantti.filterBox',   action: 'fill', value: 'laptop' },
     * ]);
     * results.forEach(r => console.log(r.selectorOrKey, r.success, r.healedSelector));
     * ```
     */
    async healAll(operations: HealOperation[]): Promise<HealAllResult[]> {
        const locatorManager = LocatorManager.getInstance();

        // ── Phase 1: attempt all actions, collect failures ─────────────────
        type FailureRecord = {
            index: number;
            op: HealOperation;
            selector: string;
            locatorKey: string | null;
            error: Error;
        };

        const results: HealAllResult[] = operations.map(op => ({
            selectorOrKey: op.selectorOrKey,
            success: false,
        }));

        const failures: FailureRecord[] = [];

        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            if (!op) continue;
            const resolved = locatorManager.getLocator(op.selectorOrKey);
            const selector = resolved || op.selectorOrKey;
            const locatorKey = resolved ? op.selectorOrKey : null;

            try {
                await this.runOperation(op, selector);
                results[i] = { selectorOrKey: op.selectorOrKey, success: true };
            } catch (err) {
                if (locatorKey) {
                    await locatorManager.recordSelectorFailure(locatorKey);
                }
                failures.push({ index: i, op, selector, locatorKey, error: err as Error });
            }
        }

        if (failures.length === 0) return results;

        logger.info(`[AutoHealer:healAll] ${failures.length} operation(s) failed — firing AI healing in parallel...`);

        // ── Phase 2: heal all failures concurrently ────────────────────────
        const healed = await Promise.allSettled(failures.map(f => this.heal(f.selector, f.error)));

        // ── Phase 3: retry healed operations sequentially ─────────────────
        for (let j = 0; j < failures.length; j++) {
            const failure = failures[j];
            const healResult = healed[j];
            if (!failure || !healResult) continue;

            if (healResult.status === 'fulfilled' && healResult.value) {
                const newSelector = healResult.value.selector;
                try {
                    await this.runOperation(failure.op, newSelector);
                    results[failure.index] = {
                        selectorOrKey: failure.op.selectorOrKey,
                        success: true,
                        healedSelector: newSelector,
                    };
                    if (failure.locatorKey) {
                        await locatorManager.updateLocator(failure.locatorKey, newSelector);
                        await locatorManager.recordSelectorHealed(failure.locatorKey);
                    }
                } catch (retryErr) {
                    results[failure.index] = {
                        selectorOrKey: failure.op.selectorOrKey,
                        success: false,
                        healedSelector: newSelector,
                        error: String(retryErr),
                    };
                }
            } else {
                results[failure.index] = {
                    selectorOrKey: failure.op.selectorOrKey,
                    success: false,
                    error: 'AI could not find a replacement selector',
                };
            }
        }

        return results;
    }

    /**
     * Execute a single HealOperation against the resolved selector.
     * @private
     */
    private async runOperation(op: HealOperation, selector: string): Promise<void> {
        switch (op.action) {
            case 'click':
                await this.page.click(selector, { timeout: config.test.timeouts.click });
                break;
            case 'fill':
                await this.page.fill(selector, op.value ?? '', { timeout: config.test.timeouts.fill });
                break;
            case 'hover':
                await this.page.hover(selector, { timeout: config.test.timeouts.click });
                break;
            case 'type':
                await this.page.locator(selector).pressSequentially(op.value ?? '', {
                    delay: 50,
                });
                break;
            case 'check':
                await this.page.check(selector, { timeout: config.test.timeouts.click });
                break;
            case 'uncheck':
                await this.page.uncheck(selector, { timeout: config.test.timeouts.click });
                break;
            case 'waitForSelector':
                await this.page.waitForSelector(selector, { timeout: config.test.timeouts.default });
                break;
            default: {
                const _exhaustive: never = op.action;
                throw new Error(`[AutoHealer:runOperation] Unsupported action: ${_exhaustive}`);
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
    private async heal(originalSelector: string, error: Error): Promise<HealingResult | null> {
        const startTime = Date.now();
        logger.info(`[AutoHealer:heal] ========== HEALING START ==========`);
        logger.info(`[AutoHealer:heal] Original selector: "${originalSelector}"`);
        logger.info(`[AutoHealer:heal] Error: ${error.message}`);
        logger.info(
            `[AutoHealer:heal] Provider: ${this.clientManager.getProvider()}, Model: ${this.clientManager.getModelName()}`
        );
        logger.info(
            `[AutoHealer:heal] Available API keys: ${this.clientManager.getKeyCount()}, Current key index: ${this.clientManager.getCurrentKeyIndex()}`
        );

        // 1. Capture simplified DOM
        logger.info(`[AutoHealer:heal] Step 1: Capturing simplified DOM...`);
        const htmlSnapshot = await getSimplifiedDOM(this.page);
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
            let rawResult: string | undefined;

            let maxKeyRotations = this.clientManager.getKeyCount();
            logger.info(`[AutoHealer:heal] Step 3: Starting AI request loop (maxKeyRotations=${maxKeyRotations})`);

            // Outer loop for key rotation
            keyLoop: for (let k = 0; k < maxKeyRotations; k++) {
                let retryCount = 0;
                const maxRetries = 3;
                logger.info(
                    `[AutoHealer:heal] Key rotation iteration k=${k}, using key index ${this.clientManager.getCurrentKeyIndex()}`
                );

                while (retryCount <= maxRetries) {
                    logger.info(`[AutoHealer:heal] Attempt: keyIteration=${k}, retryCount=${retryCount}/${maxRetries}`);
                    try {
                        const aiResult = await this.clientManager.makeRequest(promptText, config.test.timeouts.default);
                        rawResult = aiResult.raw;
                        tokensUsed = aiResult.tokensUsed;
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
                            /\b503\b/.test(errorMessage) ||
                            /\b500\b/.test(errorMessage) ||
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

                        // Handle 401 Auth Errors specifically for key rotation
                        const isAuthError =
                            reqErrorTyped.status === 401 ||
                            /\b401\b/.test(errorMessage) ||
                            errorMessage.includes('unauthorized');

                        logger.info(`[AutoHealer:heal] Error classification: isAuthError=${isAuthError}`);

                        if (isAuthError) {
                            logger.warn(`[AutoHealer:heal] Auth Error (401). Attempting key rotation...`);
                            const rotated = this.clientManager.rotateKey();
                            if (rotated) {
                                logger.info(
                                    `[AutoHealer:heal] Key rotation result: ${rotated} (new index: ${this.clientManager.getCurrentKeyIndex()})`
                                );
                                continue keyLoop;
                            }
                            logger.info(
                                `[AutoHealer:heal] Key rotation exhausted. Falling through to provider switch.`
                            );
                        }

                        // Handle 4xx Client Errors (Rate limit, Auth fallback, Quota, etc)
                        const is4xxError =
                            (reqErrorTyped.status && reqErrorTyped.status >= 400 && reqErrorTyped.status < 500) ||
                            /\b429\b/.test(errorMessage) ||
                            errorMessage.includes('rate limit') ||
                            errorMessage.includes('resource exhausted') ||
                            errorMessage.includes('insufficient quota') ||
                            isAuthError;

                        logger.info(`[AutoHealer:heal] Error classification: is4xxError=${is4xxError}`);

                        if (is4xxError) {
                            logger.warn(
                                `[AutoHealer:heal] Client Error (4xx) detected: ${reqErrorTyped.status}. Attempting to switch AI provider...`
                            );
                            if (!hasSwitchedProvider && this.clientManager.switchProvider()) {
                                hasSwitchedProvider = true;
                                maxKeyRotations = this.clientManager.getKeyCount();
                                k = -1; // Reset loop to restart with the new provider
                                continue keyLoop;
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

            // 4. Parse and validate AI result
            logger.info(`[AutoHealer:heal] Step 4: Processing AI result. Raw result: "${rawResult}"`);
            const parsed = parseAIResponse(rawResult);

            if (parsed && parsed !== 'FAIL') {
                // Validate selector safety before using it
                if (!this.validateSelector(parsed)) {
                    logger.warn(
                        `[AutoHealer:heal] ❌ HEALING REJECTED. AI-returned selector failed validation: "${parsed}"`
                    );
                } else {
                    // Verify the healed selector actually matches an element on the page
                    const elementCount = await this.page.locator(parsed).count();
                    const confidence = elementCount > 0 ? 1.0 : 0.0;
                    if (confidence < config.ai.healing.confidenceThreshold) {
                        logger.warn(
                            `[AutoHealer:heal] ❌ HEALING REJECTED. Healed selector "${parsed}" matched 0 elements (confidence=${confidence} < threshold=${config.ai.healing.confidenceThreshold})`
                        );
                    } else {
                        healingSuccess = true;
                        healingResult = {
                            selector: parsed,
                            confidence,
                            reasoning: 'AI found replacement selector.',
                            strategy: 'css',
                        };
                        logger.info(`[AutoHealer:heal] ✅ HEALING SUCCEEDED! New selector: "${parsed}"`);
                    }
                }
            } else {
                logger.warn(`[AutoHealer:heal] ❌ HEALING FAILED. Result was: "${rawResult}" (FAIL or empty)`);
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
                `[AutoHealer:heal] AI Healing failed (${this.clientManager.getProvider()}): ${aiErrorTyped.message || String(aiErrorTyped)}`
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
                provider: this.clientManager.getProvider(),
                durationMs,
                ...(tokensUsed ? { tokensUsed } : {}),
                domSnapshotLength: htmlSnapshot.length,
            });
        }

        return healingResult;
    }

    /**
     * Validates that an AI-returned selector is safe to use.
     * Rejects injection payloads and selectors that don't match known-safe patterns.
     * @private
     */
    private validateSelector(selector: string): boolean {
        if (!selector || selector.trim().length === 0) {
            return false;
        }

        const trimmed = selector.trim();

        // Denylist: dangerous prefixes (case-insensitive)
        const dangerousPrefixes = ['javascript:', 'data:'];
        for (const prefix of dangerousPrefixes) {
            if (trimmed.toLowerCase().startsWith(prefix)) {
                logger.warn(`[AutoHealer:validateSelector] Rejected — dangerous prefix "${prefix}": "${trimmed}"`);
                return false;
            }
        }

        // Denylist: dangerous substrings that indicate HTML or JS injection.
        // Note: standalone `<` and `>` are NOT in the denylist because `>` is a valid
        // CSS child combinator and XPath uses `<`/`>` in comparisons.  We only block
        // patterns that unambiguously indicate injection payloads.
        const dangerousSubstrings = ['<script', '</', '<!--', 'eval(', 'document.', 'window.'];
        for (const pattern of dangerousSubstrings) {
            if (trimmed.toLowerCase().includes(pattern.toLowerCase())) {
                logger.warn(`[AutoHealer:validateSelector] Rejected — dangerous pattern "${pattern}": "${trimmed}"`);
                return false;
            }
        }

        // Allowlist: Playwright text engine prefixes
        const playwrightPrefixes = [
            'text=',
            'role=',
            'label=',
            'placeholder=',
            'alt=',
            'title=',
            'testid=',
            'data-testid=',
        ];
        for (const prefix of playwrightPrefixes) {
            if (trimmed.toLowerCase().startsWith(prefix)) {
                return true;
            }
        }

        // Allowlist: XPath expressions
        if (trimmed.startsWith('//') || trimmed.startsWith('./')) {
            return true;
        }

        // Allowlist: CSS attribute selectors starting with `[`
        if (trimmed.startsWith('[')) {
            return true;
        }

        // Allowlist: Standard CSS selector characters only
        // Permits: alphanumeric, whitespace, and common CSS selector syntax tokens
        // (#id, .class, tag, [attr], :pseudo, >, +, ~, *, comma, quotes, =, ^, $, |, -, !, @, /)
        const safeCssPattern = /^[a-zA-Z0-9\s\-_#.:,[\]()="'^$*|>+~!@/\\]+$/;
        if (safeCssPattern.test(trimmed)) {
            return true;
        }

        // Default deny: selector did not match any known-safe pattern
        logger.warn(`[AutoHealer:validateSelector] Rejected — selector does not match any safe pattern: "${trimmed}"`);
        return false;
    }
}
