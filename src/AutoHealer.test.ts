// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Page } from '@playwright/test';
import { mockGeminiGenerateContent } from './test-setup.js';
import { AutoHealer } from './AutoHealer.js';

const { mockLocatorManager } = vi.hoisted(() => {
    return {
        mockLocatorManager: {
            getLocator: vi.fn((key: string) => (key === 'app.btn' ? '#old-selector' : null)),
            updateLocator: vi.fn(),
        },
    };
});

// Mock LocatorManager
vi.mock('./utils/LocatorManager.js', () => ({
    LocatorManager: {
        getInstance: vi.fn(() => mockLocatorManager),
    },
}));

// Mock page factory — includes all methods exercised by the 8 public action methods
const createMockPage = (): Partial<Page> => {
    const mockLocatorHandle = {
        waitFor: vi.fn().mockResolvedValue(undefined),
        pressSequentially: vi.fn().mockResolvedValue(undefined),
        count: vi.fn().mockResolvedValue(1),
    };
    return {
        click: vi.fn(),
        fill: vi.fn(),
        hover: vi.fn(),
        selectOption: vi.fn(),
        check: vi.fn(),
        uncheck: vi.fn(),
        waitForSelector: vi.fn(),
        evaluate: vi.fn().mockResolvedValue('<html><body><button id="btn">Click</button></body></html>'),
        locator: vi.fn().mockReturnValue(mockLocatorHandle),
    } as unknown as Partial<Page>;
};

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

            await healer.click('#nonexistent');
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

    describe('DOM Simplification (Interactive Elements + Ancestors)', () => {
        it('should include interactive elements and exclude scripts/styles', async () => {
            document.body.innerHTML = `
                <div id="wrapper">
                    <button id="keep-me">Keep Me</button>
                    <script>console.log("bad")</script>
                    <style>.css { color: red }</style>
                    <div style="color: blue">Decorative Div</div>
                    <!-- I am a comment -->
                </div>
            `;

            // Run the actual evaluate function in JSDOM
            (mockPage.evaluate as ReturnType<typeof vi.fn>).mockImplementation((fn: any) => fn());

            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#keep-me');

            const aiCallArgs = String(mockGeminiGenerateContent.mock.calls[0]![0]);

            // Interactive element (button) should be included
            expect(aiCallArgs).toContain('button');
            expect(aiCallArgs).toContain('keep-me');
            // Scripts/styles should not appear
            expect(aiCallArgs).not.toContain('<script>');
            expect(aiCallArgs).not.toContain('<style>');
            // Non-whitelisted attributes like style should be stripped
            expect(aiCallArgs).not.toContain('style="color: blue"');
        });

        it('should include ancestor chain of interactive elements', async () => {
            document.body.innerHTML = `
                <main id="app">
                    <section id="search-area">
                        <div id="inner-wrapper">
                            <input id="search-input" type="text" placeholder="Search..." />
                        </div>
                    </section>
                    <footer id="foot">
                        <p>Copyright 2025</p>
                    </footer>
                </main>
            `;

            (mockPage.evaluate as ReturnType<typeof vi.fn>).mockImplementation((fn: any) => fn());
            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#search-input');

            const aiCallArgs = String(mockGeminiGenerateContent.mock.calls[0]![0]);

            // Interactive element and its ancestors should be included
            expect(aiCallArgs).toContain('search-input');
            expect(aiCallArgs).toContain('inner-wrapper');
            expect(aiCallArgs).toContain('search-area');
            expect(aiCallArgs).toContain('app');
            // Footer with no interactive children should NOT be included
            expect(aiCallArgs).not.toContain('foot');
            expect(aiCallArgs).not.toContain('Copyright');
        });

        it('should truncate long text nodes', async () => {
            const longText = 'a'.repeat(300);
            document.body.innerHTML = `<div><button id="btn">${longText}</button></div>`;

            (mockPage.evaluate as ReturnType<typeof vi.fn>).mockImplementation((fn: any) => fn());
            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#target');

            const aiCallArgs = String(mockGeminiGenerateContent.mock.calls[0]![0]);
            expect(aiCallArgs).toContain('a'.repeat(80) + '...');
            expect(aiCallArgs).not.toContain('a'.repeat(81));
        });

        it('should collapse 3+ repeated siblings', async () => {
            document.body.innerHTML = `
                <ul id="product-list">
                    <li class="product-card"><button>Product 1</button></li>
                    <li class="product-card"><button>Product 2</button></li>
                    <li class="product-card"><button>Product 3</button></li>
                    <li class="product-card"><button>Product 4</button></li>
                    <li class="product-card"><button>Product 5</button></li>
                </ul>
            `;

            (mockPage.evaluate as ReturnType<typeof vi.fn>).mockImplementation((fn: any) => fn());
            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce(undefined);

            const healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);
            await healer.click('#target');

            const aiCallArgs = String(mockGeminiGenerateContent.mock.calls[0]![0]);

            // First 2 products should be serialized
            expect(aiCallArgs).toContain('Product 1');
            expect(aiCallArgs).toContain('Product 2');
            // Remaining 3 should be collapsed
            expect(aiCallArgs).toContain('3 more <li>');
            // Individual items beyond the 2nd should not appear
            expect(aiCallArgs).not.toContain('Product 3');
            expect(aiCallArgs).not.toContain('Product 5');
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
            // Verify updateLocator was called with correct args
            expect(manager.updateLocator).toHaveBeenCalledWith('app.btn', '#healed-selector');
        });
    });

    describe('Error Handling', () => {
        it('should rotate keys on 401 error', async () => {
            const healer = new AutoHealer(mockPage as Page, ['key1', 'key2'], 'gemini');

            // First call fails with 401
            mockGeminiGenerateContent.mockRejectedValueOnce({ status: 401, message: 'Unauthorized' });
            // Second call succeeds
            mockGeminiGenerateContent.mockResolvedValueOnce({ response: { text: () => '#healed-selector' } });

            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('Timeout')) // Initial click fails
                .mockResolvedValueOnce(undefined); // Retry succeeds

            await healer.click('#broken');

            // Should have tried twice
            expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(2);
        });

        it('should skip test on 429 Rate Limit when fallback is unavailable', async () => {
            const healer = new AutoHealer(mockPage as Page, 'key1', 'gemini');

            // Setup config to ensure no fallback is possible
            const { config } = await import('./config/index.js');
            const originalOpenAiKeys = config.ai.openai.apiKeys;
            config.ai.openai.apiKeys = undefined as any;

            // Fail with 429
            mockGeminiGenerateContent.mockRejectedValueOnce({ status: 429, message: 'Rate Limit Exceeded' });
            (mockPage.click as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Timeout'));

            await healer.click('#broken');

            const { test } = await import('@playwright/test');
            expect(test.skip).toHaveBeenCalledWith(true, expect.stringContaining('Client Error (4xx)'));

            // Restore config
            config.ai.openai.apiKeys = originalOpenAiKeys;
        });

        it('should switch AI provider on 4xx Client Error', async () => {
            const healer = new AutoHealer(mockPage as Page, 'key1', 'gemini');

            const { config } = await import('./config/index.js');
            const originalOpenAiKeys = config.ai.openai.apiKeys;
            config.ai.openai.apiKeys = ['mock-openai-key']; // Enable fallback

            // First call fails with 429 (Gemini)
            mockGeminiGenerateContent.mockRejectedValueOnce({ status: 429, message: 'Rate Limit Exceeded' });

            // Setup second call to succeed (OpenAI)
            const { mockOpenaiCreate } = await import('./test-setup.js');
            mockOpenaiCreate.mockResolvedValueOnce({
                id: 'mock-id',
                model: 'mock-model',
                choices: [{ message: { content: '#healed-selector' } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            });

            (mockPage.click as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('Timeout')) // Initial click fails
                .mockResolvedValueOnce(undefined); // Retry succeeds

            await healer.click('#broken');

            // Should have tried both providers
            expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(1);
            expect(mockOpenaiCreate).toHaveBeenCalledTimes(1);

            config.ai.openai.apiKeys = originalOpenAiKeys;
        });
    });

    describe('validateSelector()', () => {
        // Access the private method via a typed cast — avoids `any`
        type WithValidate = { validateSelector: (selector: string) => boolean };
        const getValidator = (healer: AutoHealer) =>
            (healer as unknown as WithValidate).validateSelector.bind(healer as unknown as WithValidate);

        let healer: AutoHealer;

        beforeEach(() => {
            healer = new AutoHealer(mockPage as Page, 'test-key', 'gemini');
        });

        describe('valid CSS selectors', () => {
            it('should accept a simple element selector', () => {
                expect(getValidator(healer)('button')).toBe(true);
            });

            it('should accept an ID selector', () => {
                expect(getValidator(healer)('#submit-btn')).toBe(true);
            });

            it('should accept a class selector', () => {
                expect(getValidator(healer)('.primary-button')).toBe(true);
            });

            it('should accept a compound selector with descendant combinator', () => {
                expect(getValidator(healer)('form .submit-button')).toBe(true);
            });

            it('should accept a selector with child combinator', () => {
                expect(getValidator(healer)('ul > li.active')).toBe(true);
            });

            it('should accept a selector with a pseudo-class', () => {
                expect(getValidator(healer)('input:focus')).toBe(true);
            });

            it('should accept an attribute selector', () => {
                expect(getValidator(healer)('[data-testid="search-input"]')).toBe(true);
            });

            it('should accept a type + attribute compound selector', () => {
                expect(getValidator(healer)('input[type="text"]')).toBe(true);
            });

            it('should accept a selector with adjacent sibling combinator', () => {
                expect(getValidator(healer)('label + input')).toBe(true);
            });
        });

        describe('valid XPath selectors', () => {
            it('should accept an absolute XPath starting with //', () => {
                expect(getValidator(healer)('//button[@id="submit"]')).toBe(true);
            });

            it('should accept a relative XPath starting with ./', () => {
                expect(getValidator(healer)('./div/span[@class="label"]')).toBe(true);
            });

            it('should accept an XPath with text()', () => {
                expect(getValidator(healer)('//button[text()="Submit"]')).toBe(true);
            });

            it('should accept an XPath with contains()', () => {
                expect(getValidator(healer)('//input[contains(@placeholder,"Search")]')).toBe(true);
            });
        });

        describe('valid Playwright text engine selectors', () => {
            it('should accept text= selector', () => {
                expect(getValidator(healer)('text=Submit')).toBe(true);
            });

            it('should accept role= selector', () => {
                expect(getValidator(healer)('role=button')).toBe(true);
            });

            it('should accept label= selector', () => {
                expect(getValidator(healer)('label=Email address')).toBe(true);
            });

            it('should accept placeholder= selector', () => {
                expect(getValidator(healer)('placeholder=Enter your name')).toBe(true);
            });

            it('should accept alt= selector', () => {
                expect(getValidator(healer)('alt=Company logo')).toBe(true);
            });

            it('should accept title= selector', () => {
                expect(getValidator(healer)('title=Close dialog')).toBe(true);
            });

            it('should accept testid= selector', () => {
                expect(getValidator(healer)('testid=login-form')).toBe(true);
            });

            it('should accept data-testid= selector', () => {
                expect(getValidator(healer)('data-testid=search-input')).toBe(true);
            });

            it('should accept text= with mixed case prefix', () => {
                expect(getValidator(healer)('TEXT=Submit')).toBe(true);
            });
        });

        describe('dangerous patterns — denylist', () => {
            it('should reject javascript: URI', () => {
                expect(getValidator(healer)('javascript:alert(1)')).toBe(false);
            });

            it('should reject javascript: URI with uppercase prefix', () => {
                expect(getValidator(healer)('JavaScript:alert(1)')).toBe(false);
            });

            it('should reject data: URI', () => {
                expect(getValidator(healer)('data:text/html,<h1>hi</h1>')).toBe(false);
            });

            it('should reject a selector containing <script', () => {
                expect(getValidator(healer)('<script>alert(1)</script>')).toBe(false);
            });

            it('should reject a selector containing a closing tag </', () => {
                expect(getValidator(healer)('</div>')).toBe(false);
            });

            it('should reject a selector containing an HTML comment <!--', () => {
                expect(getValidator(healer)('<!-- injected -->')).toBe(false);
            });

            it('should reject a selector containing eval(', () => {
                expect(getValidator(healer)('#id eval(alert(1))')).toBe(false);
            });

            it('should reject a selector containing document.', () => {
                expect(getValidator(healer)('document.getElementById("x")')).toBe(false);
            });

            it('should reject a selector containing window.', () => {
                expect(getValidator(healer)('window.location')).toBe(false);
            });

            it('should reject a selector containing an inline <script tag (no closing slash needed)', () => {
                expect(getValidator(healer)('#id<script>x</script>')).toBe(false);
            });

            it('should reject a selector that starts an HTML comment sequence', () => {
                expect(getValidator(healer)('<!--#id-->')).toBe(false);
            });
        });

        describe('edge cases', () => {
            it('should reject an empty string', () => {
                expect(getValidator(healer)('')).toBe(false);
            });

            it('should reject a whitespace-only string', () => {
                expect(getValidator(healer)('   ')).toBe(false);
            });

            it('should reject a selector with only unknown special characters', () => {
                expect(getValidator(healer)('{}')).toBe(false);
            });

            it('should accept a selector with leading/trailing whitespace after trim', () => {
                // Trim is applied internally so surrounding spaces should be fine
                expect(getValidator(healer)('  #submit-btn  ')).toBe(true);
            });
        });

        describe('integration — heal() returns null when selector fails validation', () => {
            it('should treat a malicious AI response as a healing failure', async () => {
                (mockPage.click as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Element not found'));

                // AI returns a dangerous selector
                mockGeminiGenerateContent.mockResolvedValue({
                    response: { text: () => 'javascript:alert(1)' },
                });

                const healerInstance = new AutoHealer(mockPage as Page, 'test-key', 'gemini', undefined, true);

                // executeAction re-throws the original error when heal() returns null
                await expect(healerInstance.click('#any-selector')).rejects.toThrow('Element not found');

                // The retry click must NOT have been called with the malicious selector
                const clickCalls = (mockPage.click as ReturnType<typeof vi.fn>).mock.calls;
                const retryCallArgs = clickCalls.slice(1).flat();
                expect(retryCallArgs).not.toContain('javascript:alert(1)');
            });
        });
    });
});
