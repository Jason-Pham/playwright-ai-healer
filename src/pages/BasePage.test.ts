import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { AutoHealer } from '../AutoHealer.js';
import type { SiteHandler } from '../utils/SiteHandler.js';

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
        };

        mockAutoHealer = {} as AutoHealer;

        mockSiteHandler = {
            dismissOverlays: vi.fn().mockResolvedValue(undefined),
        };

        basePage = new TestPage(mockPage as unknown as Page, mockAutoHealer, mockSiteHandler);
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

            expect(mockSiteHandler.dismissOverlays).toHaveBeenCalled();
            expect(mockLocatorObj.focus).toHaveBeenCalled();
            expect(mockLocatorObj.clear).toHaveBeenCalled();
            expect(mockLocatorObj.fill).toHaveBeenCalledWith('test-value', expect.objectContaining({ force: true }));
        });
    });

    describe('safeClick', () => {
        it('should dismiss overlays and click', async () => {
            const mockLocatorObj = {
                click: vi.fn(),
            };

            await basePage.safeClick(mockLocatorObj as unknown as Locator);

            expect(mockSiteHandler.dismissOverlays).toHaveBeenCalled();
            expect(mockLocatorObj.click).toHaveBeenCalled();
        });
    });

    describe('safeVerifyURL', () => {
        it('should dismiss overlays and verify URL', async () => {
            const regex = /example\.com/;
            await basePage.safeVerifyURL(regex);

            expect(mockSiteHandler.dismissOverlays).toHaveBeenCalled();
            expect(mockPage.waitForLoadState).toHaveBeenCalledWith('load', expect.anything());
            // expect has been mocked to return an object with toHaveURL
            // We need to verify that expectation was set on page
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
    });
});
