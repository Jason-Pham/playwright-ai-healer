/**
 * Core types for the Self-Healing Playwright Agent framework
 */

/**
 * Supported AI providers
 */
export type AIProvider = 'openai' | 'gemini';

/**
 * Selector strategy used by the AI during healing
 */
export type SelectorStrategy = 'id' | 'css' | 'xpath' | 'text' | 'role' | 'data-testid';

/**
 * Structured result from an AI healing attempt
 */
export interface HealingResult {
    /** The replacement CSS/XPath/role selector returned by the AI. */
    selector: string;
    /** Confidence score in the range 0–1. Values below `config.ai.healing.confidenceThreshold` are rejected. */
    confidence: number;
    /** Human-readable explanation of why the AI chose this selector. */
    reasoning: string;
    /** Selector strategy the AI applied to locate the element. */
    strategy: SelectorStrategy;
}

/**
 * A recorded healing event for reporting
 */
export interface HealingEvent {
    /** ISO 8601 timestamp of when the healing attempt started. */
    timestamp: string;
    /** The selector that failed and triggered the healing attempt. */
    originalSelector: string;
    /** The healing result if the AI succeeded, or `null` if healing failed. */
    result: HealingResult | null;
    /** Error message from the failed AI request, if any. */
    error?: string;
    /** Whether the healing attempt ultimately succeeded. */
    success: boolean;
    /** AI provider that was used for this healing attempt. */
    provider: AIProvider;
    /** Total duration of the healing attempt in milliseconds. */
    durationMs: number;
    /** Token usage from the AI provider (if available) */
    tokensUsed?: {
        /** Number of tokens in the prompt sent to the AI. */
        prompt: number;
        /** Number of tokens in the AI's response. */
        completion: number;
        /** Total tokens consumed (prompt + completion). */
        total: number;
    };
    /** Character length of the DOM snapshot sent to the AI */
    domSnapshotLength?: number;
}

/**
 * AI error with optional status code
 */
export interface AIError extends Error {
    /** HTTP status code from the AI provider response, if available. */
    status?: number;
    /** Provider-specific error code string, if available. */
    code?: string;
}

/**
 * Click options extending Playwright's native options
 */
export interface ClickOptions {
    /** Maximum time in milliseconds to wait for the element to be actionable. */
    timeout?: number;
    /** Bypass actionability checks and force the click. */
    force?: boolean;
    /** Do not wait for initiated navigations to finish after the click. */
    noWaitAfter?: boolean;
    /** Perform a trial run — check actionability without actually clicking. */
    trial?: boolean;
    /** Click at this position relative to the element's top-left corner. */
    position?: { x: number; y: number };
}

/**
 * Fill options extending Playwright's native options
 */
export interface FillOptions {
    /** Maximum time in milliseconds to wait for the element to be actionable. */
    timeout?: number;
    /** Do not wait for initiated navigations to finish after filling. */
    noWaitAfter?: boolean;
    /** Bypass actionability checks and force the fill. */
    force?: boolean;
}

/**
 * Hover options extending Playwright's native options
 */
export interface HoverOptions {
    timeout?: number;
    force?: boolean;
    position?: { x: number; y: number };
}

/**
 * Type (pressSequentially) options
 */
export interface TypeOptions {
    delay?: number;
    timeout?: number;
}

/**
 * SelectOption options extending Playwright's native options
 */
export interface SelectOptionOptions {
    timeout?: number;
    force?: boolean;
}

/**
 * SelectOption value argument — mirrors Playwright's overload
 */
export type SelectOptionValues = string | string[] | { value?: string; label?: string; index?: number };

/**
 * Check/uncheck options extending Playwright's native options
 */
export interface CheckOptions {
    timeout?: number;
    force?: boolean;
    position?: { x: number; y: number };
}

/**
 * WaitForSelector options extending Playwright's native options
 */
export interface WaitForSelectorOptions {
    state?: 'attached' | 'detached' | 'visible' | 'hidden';
    timeout?: number;
}

/**
 * Timeout configuration used across the test framework (all values in milliseconds)
 */
export interface TimeoutConfig {
    /** Default timeout for most page interactions. */
    default: number;
    /** Timeout for waiting on cookie/consent banners to appear. */
    cookie: number;
    /** Timeout for URL pattern verification after navigation. */
    urlVerify: number;
    /** Timeout for waiting on product visibility assertions. */
    productVisibility: number;
    /** Timeout for click and hover actions. */
    click: number;
    /** Timeout for fill and type actions. */
    fill: number;
}

/**
 * AI provider configuration used by `AutoHealer`
 */
export interface AIConfig {
    /** Active AI provider. */
    provider: AIProvider;
    gemini: {
        /** Gemini API key. Required when `provider` is `'gemini'`. */
        apiKey?: string;
        /** Gemini model name (e.g. `'gemini-flash-latest'`). */
        modelName: string;
    };
    openai: {
        /** Ordered list of OpenAI API keys used for key rotation. */
        apiKeys: string[];
        /** OpenAI model name (e.g. `'gpt-4o'`). */
        modelName: string;
        /** Primary OpenAI API key (first entry in `apiKeys`). */
        apiKey?: string;
    };
    healing: {
        /** Maximum number of AI retry attempts per healing event. */
        maxRetries: number;
        /** Delay in milliseconds between retry attempts. */
        retryDelay: number;
        /** Minimum confidence score (0–1) required to accept an AI-suggested selector. */
        confidenceThreshold: number;
    };
    prompts: {
        /** Function that builds the healing prompt sent to the AI. */
        healingPrompt: (selector: string, error: string, html: string) => string;
    };
}

/**
 * Locator storage structure - supports nested locator objects
 */
export interface LocatorStore {
    [key: string]: string | LocatorStore;
}

/**
 * Recursive type for nested locator storage (e.g., { gigantti: { searchInput: "#id" } })
 */
export interface LocatorMap {
    [key: string]: string | LocatorMap;
}
