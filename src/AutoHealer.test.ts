import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Page } from '@playwright/test';
import { mockGeminiGenerateContent } from './test-setup.js';
import { AutoHealer } from './AutoHealer.js';

// Mock page factory
const createMockPage = (): Partial<Page> =>
    ({
        click: vi.fn(),
        fill: vi.fn(),
        evaluate: vi.fn().mockResolvedValue('<html><body><button id="btn">Click</button></body></html>'),
    }) as unknown as Partial<Page>;

describe('AutoHealer', () => {
    let mockPage: Partial<Page>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPage = createMockPage();

        // Default mock response for Gemini
        mockGeminiGenerateContent.mockResolvedValue({
            response: { text: () => '#healed-selector' },
        });
    });

    describe('Constructor', () => {
        it('should initialize with Gemini provider', () => {
            const healer = new AutoHealer(mockPage as Page, 'test-api-key', 'gemini');
            expect(healer).toBeDefined();
        });

        it('should initialize with OpenAI provider', () => {
            const healer = new AutoHealer(mockPage as Page, 'test-api-key', 'openai');
            expect(healer).toBeDefined();
        });

        it('should accept array of API keys for key rotation', () => {
            const healer = new AutoHealer(mockPage as Page, ['key1', 'key2'], 'gemini');
            expect(healer).toBeDefined();
        });

        it('should use custom model name when provided', () => {
            const healer = new AutoHealer(mockPage as Page, 'key', 'gemini', 'gemini-pro', true);
            expect(healer).toBeDefined();
        });
    });

    describe('click()', () => {
        it('should click successfully without healing when element is found', async () => {
            (mockPage.click as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#existing-button');

            expect(mockPage.click).toHaveBeenCalledTimes(1);
            expect(mockPage.click).toHaveBeenCalledWith('#existing-button', expect.any(Object));
        });

        it('should attempt healing and retry when click fails', async () => {
            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('TimeoutError: Element not found'))
                .mockResolvedValueOnce(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#broken-selector');

            // Should have tried twice: original + healed
            expect(mockPage.click).toHaveBeenCalledTimes(2);
            expect(mockGeminiGenerateContent).toHaveBeenCalled();
        });

        it('should re-throw error when healing returns FAIL', async () => {
            (mockPage.click as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Element not found'));
            mockGeminiGenerateContent.mockResolvedValue({
                response: { text: () => 'FAIL' },
            });

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);

            await expect(healer.click('#nonexistent')).rejects.toThrow('Element not found');
        });

        it('should clean markdown code blocks from AI response', async () => {
            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('TimeoutError'))
                .mockResolvedValueOnce(undefined);

            // AI returns selector wrapped in markdown
            mockGeminiGenerateContent.mockResolvedValue({
                response: { text: () => '```\n#clean-selector\n```' },
            });

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#broken');

            // Second call should use cleaned selector
            expect(mockPage.click).toHaveBeenLastCalledWith('#clean-selector', undefined);
        });
    });

    describe('fill()', () => {
        it('should fill successfully without healing when element is found', async () => {
            (mockPage.fill as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.fill('#input-field', 'test value');

            expect(mockPage.fill).toHaveBeenCalledTimes(1);
            expect(mockPage.fill).toHaveBeenCalledWith('#input-field', 'test value', expect.any(Object));
        });

        it('should attempt healing and retry when fill fails', async () => {
            (mockPage.fill as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('TimeoutError'))
                .mockResolvedValueOnce(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.fill('#broken-input', 'value');

            expect(mockPage.fill).toHaveBeenCalledTimes(2);
            expect(mockGeminiGenerateContent).toHaveBeenCalled();
        });
    });

    describe('DOM Simplification', () => {
        it('should capture simplified DOM when healing is triggered', async () => {
            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#needs-healing');

            expect(mockPage.evaluate).toHaveBeenCalled();
        });
    });

    describe('AI Provider Integration', () => {
        it('should call Gemini API with correct prompt structure', async () => {
            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('Element not found'))
                .mockResolvedValueOnce(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#broken');

            expect(mockGeminiGenerateContent).toHaveBeenCalled();
            const callArg = String(mockGeminiGenerateContent.mock.calls[0]![0]);
            expect(callArg).toContain('#broken'); // Original selector in prompt
            expect(callArg).toContain('Element not found'); // Error message in prompt
        });
    });
});
