import { describe, it, expect, vi } from 'vitest';
import { ResponseParser } from './ResponseParser.js';

// Mock logger
vi.mock('./Logger.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('ResponseParser', () => {
    describe('parse — structured JSON', () => {
        it('should parse valid structured JSON response', () => {
            const raw = JSON.stringify({
                selector: '#submit-btn',
                confidence: 0.95,
                reasoning: 'Found button with matching ID',
                strategy: 'id',
            });

            const result = ResponseParser.parse(raw);

            expect(result).not.toBeNull();
            expect(result!.selector).toBe('#submit-btn');
            expect(result!.confidence).toBe(0.95);
            expect(result!.reasoning).toBe('Found button with matching ID');
            expect(result!.strategy).toBe('id');
        });

        it('should reject response below confidence threshold', () => {
            const raw = JSON.stringify({
                selector: '#maybe-btn',
                confidence: 0.3,
                reasoning: 'Low confidence match',
                strategy: 'css',
            });

            const result = ResponseParser.parse(raw, 0.7);

            expect(result).toBeNull();
        });

        it('should accept response at exactly the threshold', () => {
            const raw = JSON.stringify({
                selector: '#exact-btn',
                confidence: 0.7,
                reasoning: 'Exactly at threshold',
                strategy: 'css',
            });

            const result = ResponseParser.parse(raw, 0.7);

            expect(result).not.toBeNull();
            expect(result!.selector).toBe('#exact-btn');
        });

        it('should parse JSON wrapped in markdown code blocks', () => {
            const raw = '```json\n{"selector":"#wrapped","confidence":0.9,"reasoning":"test","strategy":"css"}\n```';

            const result = ResponseParser.parse(raw);

            expect(result).not.toBeNull();
            expect(result!.selector).toBe('#wrapped');
            expect(result!.confidence).toBe(0.9);
        });
    });

    describe('parse — plain string fallback', () => {
        it('should fall back to plain selector when not JSON', () => {
            const result = ResponseParser.parse('#submit-button');

            expect(result).not.toBeNull();
            expect(result!.selector).toBe('#submit-button');
            expect(result!.confidence).toBe(0.8); // default for unstructured
            expect(result!.strategy).toBe('id');
        });

        it('should infer css strategy for class selectors', () => {
            const result = ResponseParser.parse('.btn-primary');

            expect(result!.strategy).toBe('css');
        });

        it('should infer xpath strategy', () => {
            const result = ResponseParser.parse('//div[@id="main"]');

            expect(result!.strategy).toBe('xpath');
        });

        it('should infer data-testid strategy', () => {
            const result = ResponseParser.parse('[data-testid="submit"]');

            expect(result!.strategy).toBe('data-testid');
        });
    });

    describe('parse — FAIL handling', () => {
        it('should return null for FAIL', () => {
            expect(ResponseParser.parse('FAIL')).toBeNull();
        });

        it('should return null for FAIL with surrounding text', () => {
            expect(ResponseParser.parse('FAIL: no match')).toBeNull();
        });

        it('should return null for empty/undefined', () => {
            expect(ResponseParser.parse(undefined)).toBeNull();
            expect(ResponseParser.parse('')).toBeNull();
        });
    });

    describe('cleanMarkdown', () => {
        it('should strip backticks', () => {
            expect(ResponseParser.cleanMarkdown('`#selector`')).toBe('#selector');
        });

        it('should strip surrounding quotes', () => {
            expect(ResponseParser.cleanMarkdown('"#selector"')).toBe('#selector');
            expect(ResponseParser.cleanMarkdown("'#selector'")).toBe('#selector');
        });

        it('should extract from code blocks', () => {
            const raw = '```json\n{"key":"value"}\n```';
            expect(ResponseParser.cleanMarkdown(raw)).toBe('{"key":"value"}');
        });

        it('should trim whitespace', () => {
            expect(ResponseParser.cleanMarkdown('  #selector  ')).toBe('#selector');
        });
    });
});
