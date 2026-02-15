import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { AutoHealer } from '../AutoHealer.js';
import type { SiteHandler } from '../utils/SiteHandler.js';
import { config } from '../config/index.js';

// Concrete implementation for testing
class TestPage extends BasePage {
    constructor(page: Page, autoHealer: AutoHealer, siteHandler: SiteHandler) {
        super(page, autoHealer, siteHandler);
    }
}

describe('BasePage', () => {
    let mockPage: Partial<Page>;
    let mockAutoHealer: AutoHealer;
    let mockSiteHandler: SiteHandler;
    let basePage: TestPage;

    beforeEach(() => {
        mockPage = {
            goto: vi.fn(),
            waitForTimeout: vi.fn(),
            locator: vi.fn(),
            waitForLoadState: vi.fn(),
            waitForFunction: vi.fn(),
            getByRole: vi.fn(),
            on: vi.fn().mockReturnThis(), // Returns itself for chaining
        };

        mockAutoHealer = {} as AutoHealer;

        mockSiteHandler = {
            dismissOverlays: vi.fn().mockResolvedValue(undefined),
        };

        basePage = new TestPage(mockPage as unknown as Page, mockAutoHealer, mockSiteHandler);
    });

    describe('Security Challenge Handling', () => {
        it('should skip test when security challenge fails', async () => {
            // Verify listener was attached
            expect(mockPage.on).toHaveBeenCalledWith('response', expect.any(Function));

            // Extract the listener from the mock calls
            const onCalls = (mockPage.on as any).mock.calls;
            const responseCall = onCalls.find((call: any[]) => call[0] === 'response');
            expect(responseCall).toBeDefined();
            const listener = responseCall[1];

            // Simulate failed security challenge response
            const mockResponse = {
                url: () => `https://www.gigantti.fi/${config.ai.security?.vercelChallengePath}`,
                status: () => 403
            };

            // Trigger the listener
            listener(mockResponse);

            // Spy on the protected skipTest method
            // @ts-expect-error - testing protected method
            const skipSpy = vi.spyOn(basePage, 'skipTest').mockImplementation(() => { });

            await basePage.safeClick({ click: vi.fn() } as any);

            expect(skipSpy).toHaveBeenCalledWith(expect.stringContaining('Aborting test'));
        });
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
        it('should dismiss overlays and fill input', async () => {
            const mockLocatorObj = {
                fill: vi.fn(),
                focus: vi.fn().mockResolvedValue(undefined),
                clear: vi.fn().mockResolvedValue(undefined),
                click: vi.fn(),
            };

            await basePage.safeFill(mockLocatorObj as unknown as Locator, 'test-value');

            expect(mockLocatorObj.focus).toHaveBeenCalled();
            expect(mockLocatorObj.clear).toHaveBeenCalled();
            expect(mockLocatorObj.fill).toHaveBeenCalledWith('test-value', expect.objectContaining({ force: true }));
        });

        it('should suppress errors during focus and clear', async () => {
            const mockLocatorObj = {
                fill: vi.fn(),
                focus: vi.fn().mockRejectedValue(new Error('Focus failed')),
                clear: vi.fn().mockRejectedValue(new Error('Clear failed')),
                click: vi.fn(),
            };

            await basePage.safeFill(mockLocatorObj as unknown as Locator, 'test-value');

            expect(mockLocatorObj.focus).toHaveBeenCalled();
            expect(mockLocatorObj.clear).toHaveBeenCalled();
            expect(mockLocatorObj.fill).toHaveBeenCalled();
        });
    });

    describe('safeClick', () => {
        it('should dismiss overlays and click', async () => {
            const mockLocatorObj = {
                click: vi.fn(),
            };

            await basePage.safeClick(mockLocatorObj as unknown as Locator);

            expect(mockLocatorObj.click).toHaveBeenCalled();
        });
    });

    describe('safeVerifyURL', () => {
        it('should dismiss overlays and verify URL', async () => {
            const regex = /example\.com/;
            await basePage.safeVerifyURL(regex);

            expect(mockSiteHandler.dismissOverlays).toHaveBeenCalled();
            expect(mockPage.waitForLoadState).toHaveBeenCalledWith('load', expect.anything());
        });
    });

    describe('findFirstElement', () => {
        it('should construct a combined selector and wait', async () => {
            const mockCombinedLocator = {
                waitFor: vi.fn(),
            };

            (mockPage.locator as any).mockReturnValue({
                first: () => mockCombinedLocator,
            });

            const selectors = ['.one', '#two'];
            await basePage.findFirstElement(selectors, { state: 'visible' });

            // Should join with comma
            expect(mockPage.locator).toHaveBeenCalledWith('.one,#two');
            expect(mockCombinedLocator.waitFor).toHaveBeenCalledWith({ state: 'visible' });
        });

        it('should return locator without waiting if no options provided', async () => {
            const mockCombinedLocator = {
                waitFor: vi.fn(),
            };

            (mockPage.locator as any).mockReturnValue({
                first: () => mockCombinedLocator,
            });

            const selectors = ['.one', '#two'];
            await basePage.findFirstElement(selectors);

            expect(mockPage.locator).toHaveBeenCalledWith('.one,#two');
            expect(mockCombinedLocator.waitFor).not.toHaveBeenCalled();
        });
    });

    describe('expectValue', () => {
        it('should verify input value', async () => {
            const mockLocatorObj = {};
            await basePage.expectValue(mockLocatorObj as unknown as Locator, 'test-val');

            expect(mockPage.waitForLoadState).toHaveBeenCalledWith('load', expect.anything());
            // expect() is mocked globally in test-setup.ts
        });
    });
});
