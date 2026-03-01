import { type Page, test } from '@playwright/test';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config/index.js';
import { LocatorManager } from './utils/LocatorManager.js';
import { logger } from './utils/Logger.js';
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
} from './types.js';

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

                // Update locator if we have a key
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
     *
     * @param selectorOrKey - CSS selector or locator key from locators.json
     * @param options - Playwright hover options
     * @throws Error if healing fails or element still cannot be found
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
     *
     * @param selectorOrKey - CSS selector or locator key from locators.json
     * @param text - Text to type character by character
     * @param options - Delay between keystrokes and timeout
     * @throws Error if healing fails or element still cannot be found
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
     *
     * @param selectorOrKey - CSS selector or locator key from locators.json
     * @param values - Option value(s) to select
     * @param options - Playwright selectOption options
     * @throws Error if healing fails or element still cannot be found
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
     *
     * @param selectorOrKey - CSS selector or locator key from locators.json
     * @param options - Playwright check options
     * @throws Error if healing fails or element still cannot be found
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
     *
     * @param selectorOrKey - CSS selector or locator key from locators.json
     * @param options - Playwright uncheck options
     * @throws Error if healing fails or element still cannot be found
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
     *
     * @param selectorOrKey - CSS selector or locator key from locators.json
     * @param options - Playwright waitForSelector options
     * @throws Error if healing fails or element still cannot be found
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
        logger.info(`[AutoHealer:heal] DOM snapshot length: ${htmlSnapshot.length} chars (will use first 2000)`);
        logger.debug(`[AutoHealer:heal] DOM snapshot preview (first 500 chars): ${htmlSnapshot.substring(0, 500)}`);

        // 2. Construct Prompt
        logger.info(`[AutoHealer:heal] Step 2: Constructing prompt...`);
        const promptText = config.ai.prompts.healingPrompt(
            originalSelector,
            error.message,
            htmlSnapshot.substring(0, 2000)
        );
        logger.info(`[AutoHealer:heal] Prompt length: ${promptText.length} chars`);
        logger.debug(`[AutoHealer:heal] Prompt preview (first 300 chars): ${promptText.substring(0, 300)}`);

        let healingSuccess = false;
        let healingResult: HealingResult | null = null;

        try {
            let result: string | undefined;

            const maxKeyRotations = this.apiKeys.length;
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
                            const openai = this.openai;
                            const completion = await this.withTimeout(
                                signal =>
                                    openai.chat.completions.create(
                                        {
                                            messages: [{ role: 'user', content: promptText }],
                                            model: this.modelName,
                                            stream: false,
                                        },
                                        { signal }
                                    ),
                                config.test.timeouts.default,
                                'OpenAI'
                            );
                            result = completion.choices[0]?.message.content?.trim();
                            logger.info(`[AutoHealer:heal] OpenAI response received. Result: "${result}"`);
                            logger.debug(
                                `[AutoHealer:heal] Full completion choices: ${JSON.stringify(completion.choices)}`
                            );
                        } else if (this.provider === 'gemini' && this.gemini) {
                            logger.info(`[AutoHealer:heal] Sending request to Gemini (model: ${this.modelName})...`);
                            const model = this.gemini.getGenerativeModel({ model: this.modelName });
                            const resultResult = await this.withTimeout(
                                signal => model.generateContent(promptText, { signal }),
                                config.test.timeouts.default,
                                'Gemini'
                            );
                            result = resultResult.response.text().trim();
                            logger.info(`[AutoHealer:heal] Gemini response received. Result: "${result}"`);
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
                            errorMessage.includes('503') ||
                            errorMessage.includes('500') ||
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

                        const isRateLimit =
                            reqErrorTyped.status === 429 ||
                            errorMessage.includes('429') ||
                            errorMessage.includes('rate limit') ||
                            errorMessage.includes('resource exhausted') ||
                            errorMessage.includes('insufficient quota');

                        logger.info(`[AutoHealer:heal] Error classification: isRateLimit=${isRateLimit}`);

                        if (isRateLimit) {
                            logger.warn(`[AutoHealer:heal] Rate limit detected. Will skip test.`);
                            test.info().annotations.push({
                                type: 'warning',
                                description: 'Test skipped due to AI Rate Limit',
                            });
                            // This throws an error to stop the test
                            test.skip(true, 'Test skipped due to AI Rate Limit');
                            // This part is unreachable if test.skip throws as expected
                            return null;
                        }

                        const isAuthError = reqErrorTyped.status === 401 || errorMessage.includes('401');
                        logger.info(`[AutoHealer:heal] Error classification: isAuthError=${isAuthError}`);

                        if (isAuthError) {
                            logger.warn(`[AutoHealer:heal] Auth Error (401). Attempting key rotation...`);
                            const rotated = this.rotateKey();
                            logger.info(
                                `[AutoHealer:heal] Key rotation result: ${rotated} (new index: ${this.currentKeyIndex})`
                            );
                            if (rotated) {
                                continue keyLoop; // Try next key
                            } else {
                                logger.error('[AutoHealer:heal] No more API keys to try. Throwing error.');
                                throw reqErrorTyped;
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
                result = result.replace(/```/g, '').trim();
                if (originalResult !== result) {
                    logger.info(`[AutoHealer:heal] Cleaned markdown from result: "${originalResult}" -> "${result}"`);
                }
            }

            if (result && result !== 'FAIL') {
                // Validate the selector before using or persisting it
                if (!this.validateSelector(result)) {
                    logger.warn(
                        `[AutoHealer:heal] ❌ HEALING REJECTED. AI-returned selector failed validation: "${result}"`
                    );
                } else {
                    healingSuccess = true;
                    healingResult = {
                        selector: result,
                        confidence: 1.0,
                        reasoning: 'AI found replacement selector.',
                        strategy: 'css',
                    };
                    logger.info(`[AutoHealer:heal] ✅ HEALING SUCCEEDED! New selector: "${result}"`);
                }
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
            });
        }

        return healingResult;
    }

    /**
     * Validates an AI-returned selector against an allowlist of safe patterns and a
     * denylist of dangerous payloads before the selector is used in any page interaction
     * or persisted to locators.json.
     *
     * Allowed patterns:
     * - XPath expressions starting with `//` or `./`
     * - Playwright built-in text engines: `text=`, `role=`, `label=`, `placeholder=`,
     *   `alt=`, `title=`, `testid=`, `data-testid=`
     * - Attribute selectors starting with `[`
     * - Standard CSS selectors matching only known-safe characters
     *
     * Rejected patterns (denylist takes precedence):
     * - Strings starting with `javascript:` or `data:`
     * - Strings containing HTML tags or angle brackets (`<`, `>`)
     * - Strings containing JS execution primitives: `eval(`, `document.`, `window.`
     *
     * @param selector - The selector string returned by the AI provider
     * @returns `true` when the selector is considered safe, `false` otherwise
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

    /**
     * Wraps an API call factory with a timeout and AbortController so the underlying
     * HTTP request is cancelled when the deadline is reached.
     *
     * @param factory - A function that receives an AbortSignal and returns a Promise
     * @param ms - Timeout in milliseconds
     * @param label - Human-readable label for the error message
     */
    private async withTimeout<T>(factory: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T> {
        const controller = new AbortController();
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                controller.abort();
                reject(new Error(`[AutoHealer] ${label} API request timed out after ${ms / 1000}s`));
            }, ms);
        });
        try {
            return await Promise.race([factory(controller.signal), timeoutPromise]);
        } finally {
            clearTimeout(timeoutId!);
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
            // Helper to scrub PII
            const scrubPII = (text: string): string => {
                // Email regex
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                // Simple phone regex (international or local)
                const phoneRegex = /(\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g;

                return text.replace(emailRegex, '[EMAIL]').replace(phoneRegex, '[PHONE]');
            };

            // Clone is safer for structural integrity than a custom serializer.
            // We apply PII scrubbing and attribute filtering on the clone.
            const clone = document.body.cloneNode(true) as HTMLElement;

            // Allow-list for attributes to keep token count low and focus on structural attributes
            const validAttrs = new Set([
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
            ]);

            // 1. Remove noise
            const removeTags = ['script', 'style', 'svg', 'noscript', 'iframe', 'video', 'audio'];
            removeTags.forEach(tag => clone.querySelectorAll(tag).forEach(el => el.remove()));

            // 2. Walk and Clean
            const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const el = node as HTMLElement;

                    // Scrub Attributes
                    Array.from(el.attributes).forEach(attr => {
                        if (attr.name === 'value' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                            el.setAttribute(attr.name, '[REDACTED]');
                        } else if (!validAttrs.has(attr.name) && !attr.name.startsWith('data-test')) {
                            el.removeAttribute(attr.name);
                        }
                    });
                } else if (node.nodeType === Node.TEXT_NODE) {
                    if (node.nodeValue) {
                        node.nodeValue = scrubPII(node.nodeValue);
                        if (node.nodeValue.length > 200) {
                            node.nodeValue = node.nodeValue.substring(0, 200) + '...';
                        }
                    }
                }
            }

            return clone.innerHTML;
        });
    }
}
