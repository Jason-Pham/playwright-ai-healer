
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
