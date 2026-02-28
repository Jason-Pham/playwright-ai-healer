import { z } from 'zod';
import { logger } from './Logger.js';
import type { HealingResult, SelectorStrategy } from '../types.js';

/**
 * Schema for structured AI healing responses.
 * The AI is asked to return JSON matching this shape.
 */
const aiResponseSchema = z.object({
    selector: z.string().min(1),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    strategy: z.enum(['id', 'css', 'xpath', 'text', 'role', 'data-testid']),
});

type AIResponse = z.infer<typeof aiResponseSchema>;

/**
 * ResponseParser — Parses raw AI output into structured HealingResult.
 *
 * Attempts to parse as structured JSON first. Falls back to extracting
 * a plain CSS selector string if the AI doesn't return valid JSON.
 */
export class ResponseParser {
    /**
     * Parse raw AI text into a HealingResult.
     *
     * @param raw - Raw text response from the AI
     * @param confidenceThreshold - Minimum confidence to accept (0-1)
     * @returns HealingResult if successful, null if FAIL or below threshold
     */
    static parse(raw: string | undefined, confidenceThreshold: number = 0.7): HealingResult | null {
        if (!raw) return null;

        const cleaned = this.cleanMarkdown(raw);

        // Check for explicit FAIL
        if (this.isFail(cleaned)) {
            logger.info('[ResponseParser] AI returned FAIL.');
            return null;
        }

        // Try structured JSON parsing first
        const structured = this.tryParseJSON(cleaned);
        if (structured) {
            if (structured.confidence < confidenceThreshold) {
                logger.warn(
                    `[ResponseParser] Confidence ${structured.confidence} below threshold ${confidenceThreshold}. Rejecting.`
                );
                return null;
            }
            logger.info(
                `[ResponseParser] Parsed structured response: selector="${structured.selector}", confidence=${structured.confidence}, strategy=${structured.strategy}`
            );
            return {
                selector: structured.selector,
                confidence: structured.confidence,
                reasoning: structured.reasoning,
                strategy: structured.strategy,
            };
        }

        // Fallback: treat cleaned text as a plain selector string
        logger.info(`[ResponseParser] Falling back to plain selector: "${cleaned}"`);
        return {
            selector: cleaned,
            confidence: 0.8, // Default confidence for unstructured responses
            reasoning: 'AI returned plain selector (no structured JSON).',
            strategy: this.inferStrategy(cleaned),
        };
    }

    /**
     * Remove markdown formatting from AI response.
     */
    static cleanMarkdown(raw: string): string {
        let result = raw.trim();

        // Extract from JSON code block
        const jsonBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonBlockMatch?.[1]) {
            return jsonBlockMatch[1].trim();
        }

        // Extract from inline backticks (take the last one — most likely the selector)
        const backtickMatch = result.match(/`([^`]+)`/g);
        if (backtickMatch) {
            const lastMatch = backtickMatch[backtickMatch.length - 1];
            if (lastMatch) {
                result = lastMatch.replace(/`/g, '').trim();
            }
        } else {
            result = result.replace(/```/g, '').trim();
        }

        // Remove surrounding quotes
        if (
            (result.startsWith('"') && result.endsWith('"')) ||
            (result.startsWith("'") && result.endsWith("'"))
        ) {
            result = result.substring(1, result.length - 1);
        }

        return result;
    }

    /**
     * Check if the response indicates failure.
     */
    private static isFail(cleaned: string): boolean {
        return cleaned === 'FAIL' || (cleaned.includes('FAIL') && cleaned.length < 20);
    }

    /**
     * Attempt to parse the cleaned string as structured JSON.
     */
    private static tryParseJSON(cleaned: string): AIResponse | null {
        try {
            const parsed: unknown = JSON.parse(cleaned);
            const result = aiResponseSchema.safeParse(parsed);
            if (result.success) {
                return result.data;
            }
            logger.debug(`[ResponseParser] JSON parsed but schema validation failed: ${JSON.stringify(result.error.issues)}`);
            return null;
        } catch {
            // Not valid JSON — will fall back to plain string
            return null;
        }
    }

    /**
     * Infer the selector strategy from the selector string.
     */
    private static inferStrategy(selector: string): SelectorStrategy {
        if (selector.startsWith('#')) return 'id';
        if (selector.startsWith('//') || selector.startsWith('xpath=')) return 'xpath';
        if (selector.startsWith('text=')) return 'text';
        if (selector.startsWith('role=')) return 'role';
        if (selector.includes('data-testid')) return 'data-testid';
        return 'css';
    }
}
