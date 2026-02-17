import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoHealer } from '../../src/AutoHealer.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { LocatorManager } from '../../src/utils/LocatorManager.js';

// Mock dependencies
vi.mock('@playwright/test', () => ({
    test: {
        info: vi.fn().mockReturnValue({ annotations: [] }),
        skip: vi.fn(),
    },
}));

vi.mock('../../src/utils/Logger.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../src/config/index.js', () => ({
    config: {
        ai: {
            prompts: {
                healingPrompt: () => 'mock prompt',
            },
        },
        test: {
            timeouts: {
                short: 1000,
            },
        },
    },
}));

vi.mock('../../src/utils/LocatorManager.js', () => ({
    LocatorManager: {
        getInstance: vi.fn(() => ({
            getLocator: vi.fn(),
            updateLocator: vi.fn(),
        })),
    },
}));

// Mock GoogleGenerativeAI
vi.mock('@google/generative-ai', () => {
    const generateContentMock = vi.fn();
    const getGenerativeModelMock = vi.fn(() => ({
        generateContent: generateContentMock,
    }));

    return {
        GoogleGenerativeAI: vi.fn(function () {
            return {
                getGenerativeModel: getGenerativeModelMock,
            };
        }),
    };
});

describe('AutoHealer Core Logic', () => {
    let autoHealer: AutoHealer;
    let mockPage: any;
    let mockGenerateContent: any;
    let mockUpdateLocator: any;

    beforeEach(() => {
        // Mock setTimeout to resolve immediately
        vi.stubGlobal('setTimeout', (fn: Function) => {
            fn();
            return 1;
        });

        mockPage = {
            evaluate: vi.fn().mockResolvedValue('<html>mock dom</html>'),
            click: vi.fn(),
            fill: vi.fn(),
        };

        // Reset mocks
        vi.clearAllMocks();

        // Setup AI mock
        const MockGenAI = vi.mocked(GoogleGenerativeAI);
        const mockModel = {
            generateContent: vi.fn(),
        };
        (MockGenAI as any).mockImplementation(function () {
            return {
                getGenerativeModel: () => mockModel,
            };
        });
        mockGenerateContent = mockModel.generateContent;

        // Setup LocatorManager mock
        mockUpdateLocator = vi.fn();
        (LocatorManager.getInstance as any).mockReturnValue({
            getLocator: vi.fn(),
            updateLocator: mockUpdateLocator,
        });

        autoHealer = new AutoHealer(mockPage, 'mock-key', 'gemini');
    });

    describe('click() Healing Flow', () => {
        it('should retry click with new selector when initial click fails', async () => {
            const brokenSelector = '#broken-btn';
            const healedSelector = '#fixed-btn';

            // Mock page.click to fail once, then succeed
            mockPage.click.mockRejectedValueOnce(new Error('Element not found')).mockResolvedValueOnce(undefined);

            // Mock AI to return a healed selector
            mockGenerateContent.mockResolvedValue({
                response: {
                    text: () => healedSelector,
                },
            });

            await autoHealer.click(brokenSelector);

            // Expect heal to have been called
            expect(mockGenerateContent).toHaveBeenCalled();

            // Expect page.click to be called twice
            expect(mockPage.click).toHaveBeenCalledTimes(2);

            // First call with broken selector
            expect(mockPage.click).toHaveBeenNthCalledWith(1, brokenSelector, expect.anything());

            // Second call with HEALED selector
            // Note: The second argument is 'options'. We passed undefined, so it should be checked loosely or specifically.
            // In the implementation: await this.page.click(result.selector, options);
            expect(mockPage.click).toHaveBeenNthCalledWith(2, healedSelector, undefined);
        });

        it('should update locator manager if a key was provided', async () => {
            const key = 'submitButton';
            const brokenSelector = '#old-submit';
            const healedSelector = '#new-submit';

            // Mock LocatorManager to return broken selector for the key
            (LocatorManager.getInstance() as any).getLocator.mockReturnValue(brokenSelector);

            // Mock page failure and AI success
            mockPage.click.mockRejectedValueOnce(new Error('Element not found')).mockResolvedValueOnce(undefined);
            mockGenerateContent.mockResolvedValue({
                response: { text: () => healedSelector },
            });

            await autoHealer.click(key);

            // Expect updateLocator to be called
            expect(mockUpdateLocator).toHaveBeenCalledWith(key, healedSelector);
        });

        it('should throw error if healing fails (returns null)', async () => {
            const brokenSelector = '#broken';

            mockPage.click.mockRejectedValue(new Error('Element not found'));

            // Mock AI to return FAIL or throw
            mockGenerateContent.mockResolvedValue({
                response: { text: () => 'FAIL' },
            });

            await expect(autoHealer.click(brokenSelector)).rejects.toThrow('Element not found');

            // Should not retry click
            expect(mockPage.click).toHaveBeenCalledTimes(1);
        });
    });

    describe('fill() Healing Flow', () => {
        it('should retry fill with new selector when initial fill fails', async () => {
            const brokenSelector = '#broken-input';
            const healedSelector = '#fixed-input';
            const value = 'test value';

            // Mock page.fill to fail once, then succeed
            mockPage.fill.mockRejectedValueOnce(new Error('Element not found')).mockResolvedValueOnce(undefined);

            // Mock AI
            mockGenerateContent.mockResolvedValue({
                response: { text: () => healedSelector },
            });

            await autoHealer.fill(brokenSelector, value);

            expect(mockPage.fill).toHaveBeenCalledTimes(2);
            expect(mockPage.fill).toHaveBeenNthCalledWith(1, brokenSelector, value, expect.anything());
            expect(mockPage.fill).toHaveBeenNthCalledWith(2, healedSelector, value, undefined);
        });
    });
});
