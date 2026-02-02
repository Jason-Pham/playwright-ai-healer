
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
