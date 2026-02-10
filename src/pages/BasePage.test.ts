import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { AutoHealer } from '../AutoHealer.js';

vi.mock('@playwright/test', () => {
    const expectMock = vi.fn((actual: unknown) => {
        if (typeof actual === 'function') {
            return {
                toPass: vi.fn(async () => {
                    await (actual as () => Promise<void>)();
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

// Define mock types using Vitest's Mock type
type MockPage = {
    goto: ReturnType<typeof vi.fn>;
    waitForTimeout: ReturnType<typeof vi.fn>;
    locator: ReturnType<typeof vi.fn>;
    waitForLoadState: ReturnType<typeof vi.fn>;
    waitForFunction: ReturnType<typeof vi.fn>;
    getByRole: ReturnType<typeof vi.fn>;
};

type MockLocator = {
    click: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    isVisible: ReturnType<typeof vi.fn>;
    first: ReturnType<typeof vi.fn>;
    waitFor: ReturnType<typeof vi.fn>;
};

describe('BasePage', () => {
    let mockPage: MockPage;
    let mockAutoHealer: AutoHealer; // We can use Partial if needed, or cast
    let basePage: TestPage;

    beforeEach(() => {
        mockPage = {
            goto: vi.fn(),
            waitForTimeout: vi.fn(),
            locator: vi.fn(),
            waitForLoadState: vi.fn(),
            waitForFunction: vi.fn(),
            getByRole: vi.fn(),
        };

        mockAutoHealer = {} as AutoHealer;

        basePage = new TestPage(mockPage as unknown as Page, mockAutoHealer);
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
            const mockLocatorObj: Partial<MockLocator> = {
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

            await basePage.safeFill(mockLocatorObj as unknown as Locator, 'test-value');

            expect(mockLocatorObj.focus).toHaveBeenCalled();
            expect(mockLocatorObj.clear).toHaveBeenCalled();
            expect(mockLocatorObj.fill).toHaveBeenCalledWith(
                'test-value',
                expect.objectContaining({
                    force: true,
                })
            );
        });
    });

    describe('safeClick', () => {
        it('should attempt to dismiss cookie banner then click', async () => {
            const mockLocatorObj: Partial<MockLocator> = {
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

            await basePage.safeClick(mockLocatorObj as unknown as Locator);

            expect(mockLocatorObj.click).toHaveBeenCalled();
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
