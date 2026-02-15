// Test setup file for proper mock hoisting
import { vi } from 'vitest';

// Create controllable mock functions
export const mockGeminiGenerateContent = vi.fn();
export const mockOpenaiCreate = vi.fn();

// Mock @google/generative-ai with a proper class
vi.mock('@google/generative-ai', () => {
    // Define a mock class that can be instantiated with 'new'
    class MockGoogleGenerativeAI {
        constructor(_apiKey: string) { }
        getGenerativeModel() {
            return {
                generateContent: mockGeminiGenerateContent,
            };
        }
    }
    return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

// Mock openai with a proper class
vi.mock('openai', () => {
    class MockOpenAI {
        chat = {
            completions: {
                create: mockOpenaiCreate,
            },
        };
        constructor(_opts: unknown) { }
    }
    return { default: MockOpenAI };
});

// Mock @playwright/test
vi.mock('@playwright/test', () => ({
    test: {
        info: vi.fn().mockReturnValue({ annotations: [], project: { name: 'unit-test' } }),
        skip: vi.fn(),
    },
    expect: vi.fn().mockImplementation((actual) => ({
        toPass: vi.fn().mockImplementation(async () => {
            if (typeof actual === 'function') {
                await actual();
            }
        }),
        toHaveURL: vi.fn(),
        toHaveValue: vi.fn(),
        toBeVisible: vi.fn(),
        toContainText: vi.fn(),
        not: {
            toBeVisible: vi.fn(),
        }
    })),
}));

/**
 * Helper to create a standard structured healing JSON response for tests
 */
export function mockHealingResponse(
    selector: string,
    confidence = 0.9,
    reasoning = 'Found matching element',
    strategy = 'css'
): { response: { text: () => string } } {
    return {
        response: {
            text: () => JSON.stringify({ selector, confidence, reasoning, strategy }),
        },
    };
}
