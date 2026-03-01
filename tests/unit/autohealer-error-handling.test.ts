import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoHealer } from '../../src/AutoHealer.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { test } from '@playwright/test';

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
        debug: vi.fn(),
    },
}));

vi.mock('../../src/config/index.js', () => ({
    config: {
        ai: {
            gemini: { modelName: 'mock-gemini-model' },
            openai: { modelName: 'mock-openai-model' },
            healing: {
                domSnapshotCharLimit: 2000,
            },
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

describe('AutoHealer Error Handling', () => {
    let autoHealer: AutoHealer;
    let mockPage: any;
    let mockGenerateContent: any;

    beforeEach(() => {
        // Mock setTimeout to resolve immediately
        vi.stubGlobal('setTimeout', (fn: () => void) => {
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

        // Setup GoogleGenerativeAI mock
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
    });

    describe('503 Service Unavailable', () => {
        beforeEach(() => {
            autoHealer = new AutoHealer(mockPage, 'mock-key', 'gemini');
        });

        it('should retry on 503 error and succeed if service recovers', async () => {
            const error503 = new Error('503 Service Unavailable');
            (error503 as any).status = 503;

            mockGenerateContent
                .mockRejectedValueOnce(error503)
                .mockRejectedValueOnce(error503)
                .mockResolvedValueOnce({
                    response: {
                        text: () => 'corrected-selector',
                    },
                });

            const result = await (autoHealer as any).heal('broken-selector', new Error('Element not found'));

            expect(mockGenerateContent).toHaveBeenCalledTimes(3);
            expect(result).not.toBeNull();
            expect(result.selector).toBe('corrected-selector');
        });

        it('should fail after max retries if 503 persists', async () => {
            const error503 = new Error('503 Service Unavailable');
            (error503 as any).status = 503;

            mockGenerateContent.mockRejectedValue(error503);

            const result = await (autoHealer as any).heal('broken-selector', new Error('Element not found'));

            // Initial + 3 retries = 4 calls
            expect(mockGenerateContent).toHaveBeenCalledTimes(4);
            expect(result).toBeNull();
        });
    });

    describe('429 Rate Limit', () => {
        beforeEach(() => {
            autoHealer = new AutoHealer(mockPage, 'mock-key', 'gemini');
        });

        it('should skip the test on 429 Rate Limit error', async () => {
            const error429 = new Error('429 Too Many Requests');
            (error429 as any).status = 429;

            mockGenerateContent.mockRejectedValueOnce(error429);

            try {
                await (autoHealer as any).heal('broken-selector', new Error('Element not found'));
            } catch {
                // heal re-throws if test.skip triggers logic that might throw in mock,
                // but checking side effects is key
            }

            expect(test.skip).toHaveBeenCalledWith(true, expect.stringContaining('Client Error (4xx)'));
        });
    });

    describe('401 Unauthorized (Key Rotation)', () => {
        it('should rotate keys and retry on 401 error', async () => {
            const keys = ['key1', 'key2'];
            autoHealer = new AutoHealer(mockPage, keys, 'gemini');

            const error401 = new Error('401 Unauthorized');
            (error401 as any).status = 401;

            // Fail first key with 401, succeed with second key
            mockGenerateContent.mockRejectedValueOnce(error401).mockResolvedValueOnce({
                response: {
                    text: () => 'corrected-selector-key2',
                },
            });

            const result = await (autoHealer as any).heal('broken-selector', new Error('Element not found'));

            expect(mockGenerateContent).toHaveBeenCalledTimes(2);
            expect(result.selector).toBe('corrected-selector-key2');
        });

        it('should throw error if all keys fail with 401', async () => {
            const keys = ['key1', 'key2'];
            autoHealer = new AutoHealer(mockPage, keys, 'gemini');

            const error401 = new Error('401 Unauthorized');
            (error401 as any).status = 401;

            mockGenerateContent.mockRejectedValue(error401);

            const result = await (autoHealer as any).heal('broken-selector', new Error('Element not found'));

            expect(result).toBeNull();
            expect(mockGenerateContent).toHaveBeenCalledTimes(2); // One for each key
        });
    });
});
