// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Page } from '@playwright/test';
import { mockGeminiGenerateContent, mockHealingResponse } from './test-setup.js';
import { AutoHealer } from './AutoHealer.js';

const { mockLocatorManager } = vi.hoisted(() => {
    return {
        mockLocatorManager: {
            getLocator: vi.fn((key: string) => key === 'app.btn' ? '#old-selector' : null),
            updateLocator: vi.fn(),
        }
    };
});

// Mock LocatorManager
vi.mock('./utils/LocatorManager.js', () => ({
    LocatorManager: {
        getInstance: vi.fn(() => mockLocatorManager)
    }
}));

// Mock HealingReporter
vi.mock('./utils/HealingReporter.js', () => {
    class MockHealingReporter {
        record = vi.fn();
        getEvents = vi.fn().mockReturnValue([]);
        hasEvents = vi.fn().mockReturnValue(false);
        getSummary = vi.fn().mockReturnValue({ total: 0, healed: 0, failed: 0 });
        attach = vi.fn();
        clear = vi.fn();
    }
    return { HealingReporter: MockHealingReporter };
});

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

        // Default mock: structured JSON response
        mockGeminiGenerateContent.mockResolvedValue(
            mockHealingResponse('#healed-selector', 0.9, 'Found matching button', 'css')
        );
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

        it('should re-throw error when healing returns empty selector', async () => {
            (mockPage.click as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Element not found'));
            mockGeminiGenerateContent.mockResolvedValue({
                response: { text: () => JSON.stringify({ selector: '', confidence: 0, reasoning: 'Not found', strategy: 'css' }) },
            });

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);

            await expect(healer.click('#nonexistent')).rejects.toThrow('Element not found');
        });

        it('should reject healing when confidence is below threshold', async () => {
            (mockPage.click as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Element not found'));
            mockGeminiGenerateContent.mockResolvedValue(
                mockHealingResponse('#low-confidence', 0.2, 'Uncertain match', 'css')
            );

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);

            await expect(healer.click('#broken')).rejects.toThrow('Element not found');
        });

        it('should handle non-JSON AI response with backwards compatibility', async () => {
            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('TimeoutError'))
                .mockResolvedValueOnce(undefined);

            // AI returns a raw selector string (not JSON)
            mockGeminiGenerateContent.mockResolvedValue({
                response: { text: () => '#fallback-selector' },
            });

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#broken');

            // Should use the fallback-parsed selector
            expect(mockPage.click).toHaveBeenLastCalledWith('#fallback-selector', undefined);
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
        it('should remove scripts, styles, and non-visual elements', async () => {
            // Setup JSDOM
            document.body.innerHTML = `
                <div>
                    <button id="keep-me">Keep Me</button>
                    <script>console.log("bad")</script>
                    <style>.css { color: red }</style>
                    <div style="color: blue">Styled Div</div>
                    <!-- I am a comment -->
                </div>
            `;

            // Mock evaluate to actually run the function in the JSDOM context
            (mockPage.evaluate as ReturnType<typeof vi.fn>).mockImplementation((fn: any) => {
                return fn();
            });

            // Mock click to fail so healing triggers
            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#keep-me');

            // Check if evaluate was called
            expect(mockPage.evaluate).toHaveBeenCalled();

            const aiCallArgs = String(mockGeminiGenerateContent.mock.calls[0]![0]);

            // Assertions on the prompt sent to AI
            expect(aiCallArgs).toContain('<button id="keep-me">Keep Me</button>');
            expect(aiCallArgs).not.toContain('<script>');
            expect(aiCallArgs).not.toContain('<style>');
            expect(aiCallArgs).not.toContain('I am a comment');
            expect(aiCallArgs).not.toContain('style="color: blue"'); // Attribute removal
        });

        it('should truncate long text nodes', async () => {
            const longText = 'a'.repeat(300);
            document.body.innerHTML = `<div>${longText}</div>`;

            (mockPage.evaluate as ReturnType<typeof vi.fn>).mockImplementation((fn: any) => fn());
            (mockPage.click as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Timeout')).mockResolvedValueOnce(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#target');

            const aiCallArgs = String(mockGeminiGenerateContent.mock.calls[0]![0]);
            expect(aiCallArgs).toContain('a'.repeat(200) + '...');
            expect(aiCallArgs).not.toContain('a'.repeat(201));
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
            expect(callArg).toContain('JSON'); // Should request JSON output
        });
    });

    describe('Locator Updates', () => {
        it('should update locator file when healing succeeds with a key', async () => {
            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);

            // Use 'app.btn' which our mock LocatorManager recognizes
            await healer.click('app.btn');

            const { LocatorManager } = await import('./utils/LocatorManager.js');
            const manager = LocatorManager.getInstance();
            expect(manager.updateLocator).toHaveBeenCalledWith('app.btn', '#healed-selector');
        });
    });

    describe('Healing Reporter', () => {
        it('should expose healing events', () => {
            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini');
            const events = healer.getHealingEvents();
            expect(events).toBeDefined();
            expect(Array.isArray(events)).toBe(true);
        });

        it('should expose healing reporter instance', () => {
            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini');
            const reporter = healer.getHealingReporter();
            expect(reporter).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        it('should rotate keys on 401 error', async () => {
            const healer = new AutoHealer(mockPage as Page, ['key1', 'key2'], 'gemini');

            // First call fails with 401
            mockGeminiGenerateContent.mockRejectedValueOnce({ status: 401, message: 'Unauthorized' });
            // Second call succeeds
            mockGeminiGenerateContent.mockResolvedValueOnce(
                mockHealingResponse('#healed-selector', 0.9, 'Found it', 'css')
            );

            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('Timeout')) // Initial click fails
                .mockResolvedValueOnce(undefined); // Retry succeeds

            await healer.click('#broken');

            // Should have tried twice
            expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(2);
        });

        it('should skip test on 429 Rate Limit', async () => {
            const healer = new AutoHealer(mockPage as Page, 'key1', 'gemini');

            // Fail with 429
            mockGeminiGenerateContent.mockRejectedValueOnce({ status: 429, message: 'Rate Limit Exceeded' });
            (mockPage.click as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Timeout'));

            await expect(healer.click('#broken')).rejects.toThrow('Timeout');

            const { test } = await import('@playwright/test');
            expect(test.skip).toHaveBeenCalledWith(true, expect.stringContaining('Rate Limit'));
        });
    });
});
