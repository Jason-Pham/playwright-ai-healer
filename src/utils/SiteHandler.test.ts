import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Page, Locator } from '@playwright/test';
import { GiganttiHandler, NoOpHandler } from './SiteHandler.js';

describe('SiteHandler', () => {
    let mockPage: Partial<Page>;
    let mockCookieBtn: Partial<Locator>;

    beforeEach(() => {
        mockCookieBtn = {
            isVisible: vi.fn(),
            click: vi.fn(),
            first: vi.fn().mockReturnThis(),
        };

        mockPage = {
            waitForResponse: vi.fn(),
            locator: vi.fn().mockReturnValue(mockCookieBtn),
            waitForFunction: vi.fn(),
        };
    });

    describe('GiganttiHandler', () => {
        const handler = new GiganttiHandler();

        it('should dismiss cookie banner when visible', async () => {
            // Setup
            (mockPage.waitForResponse as any).mockResolvedValue(undefined); // Response found
            (mockCookieBtn.isVisible as any).mockResolvedValue(true);      // Button visible
            (mockPage.waitForFunction as any).mockResolvedValue(undefined); // Scroll cleared

            await handler.dismissOverlays(mockPage as Page);

            // Verify
            expect(mockPage.waitForResponse).toHaveBeenCalled();
            expect(mockPage.locator).toHaveBeenCalledWith(expect.stringContaining('aria-label="OK"'));
            expect(mockCookieBtn.click).toHaveBeenCalled();
            expect(mockPage.waitForFunction).toHaveBeenCalled();
        });

        it('should gracefully handle missing network response', async () => {
            // Setup
            (mockPage.waitForResponse as any).mockRejectedValue(new Error('Timeout'));
            (mockCookieBtn.isVisible as any).mockResolvedValue(false); // No button either

            await handler.dismissOverlays(mockPage as Page);

            // Verify we proceeded to check button despite network error
            expect(mockPage.waitForResponse).toHaveBeenCalled();
            expect(mockPage.locator).toHaveBeenCalled();
            expect(mockCookieBtn.click).not.toHaveBeenCalled();
        });

        it('should not click if button is hidden', async () => {
            (mockPage.waitForResponse as any).mockResolvedValue(undefined);
            (mockCookieBtn.isVisible as any).mockResolvedValue(false);

            await handler.dismissOverlays(mockPage as Page);

            expect(mockCookieBtn.click).not.toHaveBeenCalled();
        });

        it('should ignore scroll wait timeout', async () => {
            (mockPage.waitForResponse as any).mockResolvedValue(undefined);
            (mockCookieBtn.isVisible as any).mockResolvedValue(true);
            (mockPage.waitForFunction as any).mockRejectedValue(new Error('Timeout waiting for noScroll'));

            await expect(handler.dismissOverlays(mockPage as Page)).resolves.not.toThrow();

            expect(mockCookieBtn.click).toHaveBeenCalled();
        });

        it('should match the correct cookie policy URL', async () => {
            let capturedPredicate: (resp: any) => boolean = () => false;
            (mockPage.waitForResponse as any).mockImplementation((predicate: any) => {
                capturedPredicate = predicate;
                return Promise.resolve();
            });
            (mockCookieBtn.isVisible as any).mockResolvedValue(false);

            await handler.dismissOverlays(mockPage as Page);

            // Test the predicate logic
            const matchingResp = { url: () => 'https://policy.app.cookieinformation.com/cookie-data/gigantti.fi/cabl.json', status: () => 200 };
            const wrongUrlResp = { url: () => 'https://example.com', status: () => 200 };
            const wrongStatusResp = { url: () => 'https://policy.app.cookieinformation.com/cookie-data/gigantti.fi/cabl.json', status: () => 404 };

            expect(capturedPredicate(matchingResp)).toBe(true);
            expect(capturedPredicate(wrongUrlResp)).toBe(false);
            expect(capturedPredicate(wrongStatusResp)).toBe(false);
        });
    });

    describe('NoOpHandler', () => {
        it('should do nothing', async () => {
            const handler = new NoOpHandler();
            await handler.dismissOverlays(mockPage as Page);
            expect(mockPage.waitForResponse).not.toHaveBeenCalled();
            expect(mockPage.locator).not.toHaveBeenCalled();
        });
    });
});
