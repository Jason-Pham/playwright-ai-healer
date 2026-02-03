import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { AutoHealer } from '../AutoHealer.js';

vi.mock('@playwright/test', () => {
    const expectMock = vi.fn(actual => {
        if (typeof actual === 'function') {
            return {
                toPass: vi.fn(async _options => {
                    await actual();
                }),
            };
        }
        return {
            toHaveValue: vi.fn(),
            toHaveURL: vi.fn(),
        };
    });
    return { expect: expectMock };
});

// Concrete implementation for testing
class TestPage extends BasePage {
    constructor(page: Page, autoHealer: AutoHealer) {
        super(page, autoHealer);
    }
}

describe('BasePage', () => {
    let mockPage: any;
    let mockAutoHealer: any;
    let basePage: TestPage;

    beforeEach(() => {
        mockPage = {
            goto: vi.fn(),
            waitForTimeout: vi.fn(),
            locator: vi.fn(),
            waitForLoadState: vi.fn(),
            waitForFunction: vi.fn(),
        };

        mockAutoHealer = {};

        basePage = new TestPage(mockPage, mockAutoHealer);
    });

    describe('goto', () => {
        it('should navigate to url', async () => {
            await basePage.goto('http://example.com');
            expect(mockPage.goto).toHaveBeenCalledWith('http://example.com');
        });
    });

    describe('wait', () => {
        it('should wait for timeout', async () => {
            await basePage.wait(1000);
            expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
        });
    });

    describe('safeFill', () => {
        it('should fill input with explicit focus/clear and verification', async () => {
            const mockLocator = {
                fill: vi.fn(),
                focus: vi.fn().mockResolvedValue(undefined),
                clear: vi.fn().mockResolvedValue(undefined),
            };
            // Mock cookie banner lookups (not present)
            mockPage.locator.mockReturnValue({
                first: () => ({
                    isVisible: vi.fn().mockResolvedValue(false),
                }),
            });

            await basePage.safeFill(mockLocator as any, 'test-value');

            expect(mockLocator.focus).toHaveBeenCalled();
            expect(mockLocator.clear).toHaveBeenCalled();
            expect(mockLocator.fill).toHaveBeenCalledWith(
                'test-value',
                expect.objectContaining({
                    force: true,
                })
            );
        });
    });

    describe('safeClick', () => {
        it('should attempt to dismiss cookie banner then click', async () => {
            const mockLocator = {
                click: vi.fn(),
                isVisible: vi.fn().mockResolvedValue(false), // Cookie banner not visible
            };

            // Mock cookie banner lookups
            mockPage.locator.mockReturnValue({
                first: () => ({
                    isVisible: vi.fn().mockResolvedValue(false),
                    click: vi.fn(),
                }),
            });

            await basePage.safeClick(mockLocator as any);

            expect(mockLocator.click).toHaveBeenCalled();
        });

        it('should handle cookie banner if present', async () => {
            const mockLocator = { click: vi.fn() };
            const mockCookieBtn = {
                isVisible: vi.fn().mockResolvedValueOnce(true),
                click: vi.fn().mockResolvedValue(undefined),
            };

            // Setup mock chain for locator('...').first()
            mockPage.locator.mockImplementation((selector: string) => {
                if (selector.includes('aria-label="OK"')) {
                    return { first: () => mockCookieBtn };
                }
                return { first: () => ({ isVisible: vi.fn() }) };
            });

            await basePage.safeClick(mockLocator as any);

            expect(mockCookieBtn.click).toHaveBeenCalled();
            expect(mockLocator.click).toHaveBeenCalled();
        });
    });

    describe('findFirstElement', () => {
        it('should construct a combined selector and wait', async () => {
            const mockCombinedLocator = {
                waitFor: vi.fn(),
            };

            mockPage.locator.mockReturnValue({
                first: () => mockCombinedLocator,
            });

            const selectors = ['.one', '#two'];
            await basePage.findFirstElement(selectors, { state: 'visible' });

            // Should join with comma
            expect(mockPage.locator).toHaveBeenCalledWith('.one,#two');
            expect(mockCombinedLocator.waitFor).toHaveBeenCalledWith({ state: 'visible' });
        });
    });
});
