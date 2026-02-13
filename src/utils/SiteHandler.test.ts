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
            waitFor: vi.fn().mockResolvedValue(undefined),
        };

        mockPage = {
            waitForResponse: vi.fn(),
            locator: vi.fn().mockReturnValue(mockCookieBtn),
            waitForFunction: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn().mockResolvedValue(undefined),
        };
    });

    describe('GiganttiHandler', () => {
        const handler = new GiganttiHandler();

        it('should dismiss cookie banner when visible', async () => {
            // waitFor resolves (banner is visible)
            (mockCookieBtn.waitFor as any).mockResolvedValue(undefined);

            await handler.dismissOverlays(mockPage as Page);

            expect(mockPage.locator).toHaveBeenCalledWith(expect.stringContaining('aria-label="OK"'));
            // First call: waitFor visible, second call: waitFor hidden
            expect(mockCookieBtn.waitFor).toHaveBeenCalledWith(
                expect.objectContaining({ state: 'visible' })
            );
            expect(mockPage.waitForFunction).toHaveBeenCalled(); // SDK ready check
            expect(mockPage.evaluate).toHaveBeenCalled();        // JS click
            expect(mockCookieBtn.waitFor).toHaveBeenCalledWith(
                expect.objectContaining({ state: 'hidden' })
            );
        });

        it('should skip entirely when banner does not appear', async () => {
            // First waitFor (visible) rejects — banner didn't appear
            (mockCookieBtn.waitFor as any).mockRejectedValueOnce(new Error('Timeout'));

            await handler.dismissOverlays(mockPage as Page);

            expect(mockCookieBtn.waitFor).toHaveBeenCalledWith(
                expect.objectContaining({ state: 'visible' })
            );
            expect(mockPage.evaluate).not.toHaveBeenCalled();
        });

        it('should handle evaluate failure gracefully', async () => {
            (mockCookieBtn.waitFor as any).mockResolvedValue(undefined);
            (mockPage.evaluate as any).mockRejectedValue(new Error('Evaluate failed'));

            await expect(handler.dismissOverlays(mockPage as Page)).resolves.not.toThrow();
        });

        it('should proceed even if SDK waitForFunction times out', async () => {
            (mockCookieBtn.waitFor as any).mockResolvedValue(undefined);
            (mockPage.waitForFunction as any).mockRejectedValue(new Error('Timeout'));

            await handler.dismissOverlays(mockPage as Page);

            // Should still try to click even if SDK check times out
            expect(mockPage.evaluate).toHaveBeenCalled();
        });

        it('should use proper selectors for cookie button', async () => {
            (mockCookieBtn.waitFor as any).mockResolvedValue(undefined);

            await handler.dismissOverlays(mockPage as Page);

            const selectorArg = (mockPage.locator as any).mock.calls[0][0];
            expect(selectorArg).toContain('aria-label="OK"');
            expect(selectorArg).toContain('.coi-banner__accept');
        });

        it('should call first() on locator to get first matching button', async () => {
            (mockCookieBtn.waitFor as any).mockResolvedValue(undefined);

            await handler.dismissOverlays(mockPage as Page);

            expect(mockCookieBtn.first).toHaveBeenCalled();
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
