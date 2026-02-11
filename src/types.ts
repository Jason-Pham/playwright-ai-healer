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

/**
 * Recursive type for nested locator storage (e.g., { gigantti: { searchInput: "#id" } })
 */
export interface LocatorMap {
    [key: string]: string | LocatorMap;
}

/**
 * Playwright TestInfo annotation structure
 */
export interface TestAnnotation {
    type: string;
    description: string;
}

/**
 * Subset of Playwright's TestInfo used for logging integration
 */
export interface PlaywrightTestInfo {
    annotations: TestAnnotation[];
    title?: string;
    titlePath?: string[];
}

/**
 * AI Provider types
 */
export type AIProvider = 'openai' | 'gemini';

/**
 * Click options for AutoHealer
 */
export interface AutoHealerClickOptions {
    timeout?: number;
    force?: boolean;
    noWaitAfter?: boolean;
    position?: { x: number; y: number };
}

/**
 * Fill options for AutoHealer
 */
export interface AutoHealerFillOptions {
    timeout?: number;
    force?: boolean;
    noWaitAfter?: boolean;
}
