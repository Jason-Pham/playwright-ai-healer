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
    selector: string;
    confidence: number;
    reasoning: string;
    strategy: SelectorStrategy;
}

/**
 * A recorded healing event for reporting
 */
export interface HealingEvent {
    timestamp: string;
    originalSelector: string;
    result: HealingResult | null;
    error?: string;
    success: boolean;
    provider: AIProvider;
    durationMs: number;
    /** Token usage from the AI provider (if available) */
    tokensUsed?: {
        prompt: number;
        completion: number;
        total: number;
    };
    /** Character length of the DOM snapshot sent to the AI */
    domSnapshotLength?: number;
}

/**
 * AI error with optional status code
 */
export interface AIError extends Error {
    status?: number;
    code?: string;
}

/**
 * Click options extending Playwright's native options
 */
export interface ClickOptions {
    timeout?: number;
    force?: boolean;
    noWaitAfter?: boolean;
    trial?: boolean;
    position?: { x: number; y: number };
}

/**
 * Fill options extending Playwright's native options
 */
export interface FillOptions {
    timeout?: number;
    noWaitAfter?: boolean;
    force?: boolean;
}

/**
 * Configuration types for better type safety
 */
export interface TimeoutConfig {
    default: number;
    cookie: number;
    urlVerify: number;
    productVisibility: number;
    click: number;
    fill: number;
}

export interface AIConfig {
    provider: AIProvider;
    gemini: {
        apiKey?: string;
        modelName: string;
    };
    openai: {
        apiKeys: string[];
        modelName: string;
        apiKey?: string;
    };
    healing: {
        maxRetries: number;
        retryDelay: number;
        confidenceThreshold: number;
    };
    prompts: {
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
