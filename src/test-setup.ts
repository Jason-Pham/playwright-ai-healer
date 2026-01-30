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
        constructor(_opts: any) { }
    }
    return { default: MockOpenAI };
});

// Mock @playwright/test
vi.mock('@playwright/test', () => ({
    test: {
        info: vi.fn().mockReturnValue({ annotations: [] }),
        skip: vi.fn(),
    },
    expect: vi.fn(),
}));
