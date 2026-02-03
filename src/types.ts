/**
 * Core types for the Self-Healing Playwright Agent framework
 */

export interface HealingResult {
    originalSelector: string;
    newSelector: string;
    confidence: number;
    reasoning: string;
}

export interface HealContext {
    pageUrl: string;
    htmlSnapshot: string;
    errorMessage: string;
}

/**
 * AI Provider types
 */
export type AIProvider = 'openai' | 'gemini';

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
