// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Page, Locator } from '@playwright/test';

// Mock config to avoid env var validation at import time
vi.mock('../config/index.js', () => ({
    config: {
        test: {
            timeouts: {
                cookie: 5000,
            },
        },
    },
}));

// Hoist mockLogger so it is available inside the vi.mock factory below
const { mockLogger } = vi.hoisted(() => ({
    mockLogger: {
        debug: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('./Logger.js', () => ({
    logger: mockLogger,
}));

// Must import after vi.mock calls
import { GiganttiHandler, NoOpHandler } from './SiteHandler.js';
import locators from '../config/locators.json' with { type: 'json' };

describe('SiteHandler', () => {
    let mockPage: Partial<Page>;
    let mockCookieBtn: Partial<Locator>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCookieBtn = {
            isVisible: vi.fn().mockResolvedValue(false),
            click: vi.fn(),
            first: vi.fn().mockReturnThis(),
            waitFor: vi.fn().mockResolvedValue(undefined),
        };

        mockPage = {
            waitForResponse: vi.fn(),
            locator: vi.fn().mockReturnValue(mockCookieBtn),
            waitForFunction: vi.fn().mockResolvedValue(undefined),
            // Actually execute the callback so evaluate() branches get coverage
            evaluate: vi.fn().mockImplementation((fn: (...a: string[]) => void, arg: string) => {
                fn(arg);
                return Promise.resolve(undefined);
            }),
        };
    });

    describe('NoOpHandler', () => {
        it('should implement SiteHandler interface', () => {
            const handler = new NoOpHandler();
            expect(handler.dismissOverlays).toBeDefined();
            expect(typeof handler.dismissOverlays).toBe('function');
        });

        it('should resolve without calling any page methods', async () => {
            const handler = new NoOpHandler();
            await handler.dismissOverlays(mockPage as Page);

            expect(mockPage.waitForResponse).not.toHaveBeenCalled();
            expect(mockPage.locator).not.toHaveBeenCalled();
            expect(mockPage.waitForFunction).not.toHaveBeenCalled();
            expect(mockPage.evaluate).not.toHaveBeenCalled();
        });

        it('should return undefined (void promise)', async () => {
            const handler = new NoOpHandler();
            const result = await handler.dismissOverlays(mockPage as Page);
            expect(result).toBeUndefined();
        });
    });

    describe('GiganttiHandler', () => {
        let handler: GiganttiHandler;

        beforeEach(() => {
            handler = new GiganttiHandler();
        });

        describe('when cookie banner is visible and SDK is ready', () => {
            it('should dismiss cookie banner through SDK evaluate call', async () => {
                await handler.dismissOverlays(mockPage as Page);

                expect(mockPage.locator).toHaveBeenCalledWith(locators.gigantti.cookieBannerAccept);
                expect(mockCookieBtn.first).toHaveBeenCalled();
                expect(mockCookieBtn.waitFor).toHaveBeenCalledWith(
                    expect.objectContaining({ state: 'visible', timeout: 5000 })
                );
                expect(mockPage.waitForFunction).toHaveBeenCalled();
                expect(mockLogger.debug).toHaveBeenCalledWith('Dismissing Gigantti cookie banner...');
                expect(mockPage.evaluate).toHaveBeenCalledWith(
                    expect.any(Function),
                    locators.gigantti.cookieBannerAccept
                );
                expect(mockCookieBtn.waitFor).toHaveBeenCalledWith(
                    expect.objectContaining({ state: 'hidden', timeout: 5000 })
                );
            });

            it('should call first() on locator to target the first matching button', async () => {
                await handler.dismissOverlays(mockPage as Page);
                // btn locator + wrapper locator both call .first()
                expect(mockCookieBtn.first).toHaveBeenCalledTimes(2);
            });
        });

        describe('when cookie banner does not appear', () => {
            it('should return early without calling evaluate or waitForFunction', async () => {
                (mockCookieBtn.waitFor as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
                    new Error('Timeout waiting for visible')
                );

                await handler.dismissOverlays(mockPage as Page);

                expect(mockCookieBtn.waitFor).toHaveBeenCalledWith(expect.objectContaining({ state: 'visible' }));
                expect(mockPage.waitForFunction).not.toHaveBeenCalled();
                expect(mockPage.evaluate).not.toHaveBeenCalled();
                expect(mockLogger.debug).not.toHaveBeenCalled();
            });
        });

        describe('when SDK waitForFunction times out', () => {
            it('should proceed with evaluate despite SDK timeout', async () => {
                (mockPage.waitForFunction as ReturnType<typeof vi.fn>).mockReturnValue(
                    Promise.reject(new Error('SDK timeout'))
                );

                await handler.dismissOverlays(mockPage as Page);

                expect(mockPage.evaluate).toHaveBeenCalledWith(
                    expect.any(Function),
                    locators.gigantti.cookieBannerAccept
                );
            });

            it('should log debug message even when SDK times out', async () => {
                (mockPage.waitForFunction as ReturnType<typeof vi.fn>).mockReturnValue(
                    Promise.reject(new Error('SDK timeout'))
                );

                await handler.dismissOverlays(mockPage as Page);

                expect(mockLogger.debug).toHaveBeenCalledWith('Dismissing Gigantti cookie banner...');
            });
        });

        describe('when banner fails to hide after evaluate (force-hide fallback)', () => {
            it('should force hide banner elements when waitFor hidden times out', async () => {
                (mockCookieBtn.waitFor as ReturnType<typeof vi.fn>)
                    .mockResolvedValueOnce(undefined)
                    .mockRejectedValueOnce(new Error('Banner still visible'));

                await handler.dismissOverlays(mockPage as Page);

                expect(mockPage.evaluate).toHaveBeenCalledTimes(2);
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    'Cookie banner failed to dismiss normally. Attempting to force hide.'
                );
            });

            it('should call force-hide evaluate with the cookie selector', async () => {
                (mockCookieBtn.waitFor as ReturnType<typeof vi.fn>)
                    .mockResolvedValueOnce(undefined)
                    .mockRejectedValueOnce(new Error('Banner still visible'));

                await handler.dismissOverlays(mockPage as Page);

                const secondEvaluateCall = (mockPage.evaluate as ReturnType<typeof vi.fn>).mock.calls[1];
                expect(secondEvaluateCall?.[1]).toEqual({
                    btnSelector: locators.gigantti.cookieBannerAccept,
                    wrapperSelector: locators.gigantti.cookieBannerWrapper,
                });
            });

            it('should hide known DOM elements by ID and class when present in jsdom', async () => {
                // Inject real DOM nodes so the force-hide callback actually hides them
                const bannerEl = document.createElement('div');
                bannerEl.id = 'coiPage-1';
                document.body.appendChild(bannerEl);

                const classEl = document.createElement('div');
                classEl.className = 'coi-banner__wrapper';
                document.body.appendChild(classEl);

                (mockCookieBtn.waitFor as ReturnType<typeof vi.fn>)
                    .mockResolvedValueOnce(undefined)
                    .mockRejectedValueOnce(new Error('Banner still visible'));

                await handler.dismissOverlays(mockPage as Page);

                expect(bannerEl.style.display).toBe('none');
                expect(classEl.style.display).toBe('none');

                // Clean up
                document.body.removeChild(bannerEl);
                document.body.removeChild(classEl);
            });
        });

        describe('when evaluate throws an error', () => {
            it('should catch the error and not propagate it', async () => {
                (mockPage.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Evaluate failed'));

                await expect(handler.dismissOverlays(mockPage as Page)).resolves.not.toThrow();
            });

            it('should log warning with the error details', async () => {
                const error = new Error('page context destroyed');
                (mockPage.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(error);

                await handler.dismissOverlays(mockPage as Page);

                expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Error dismissing cookie banner'));
            });
        });

        describe('idempotency', () => {
            it('should be safe to call multiple times in succession', async () => {
                await handler.dismissOverlays(mockPage as Page);
                await handler.dismissOverlays(mockPage as Page);

                // each call uses btn locator + wrapper locator = 2 locators per call
                expect(mockPage.locator).toHaveBeenCalledTimes(4);
            });
        });

        describe('timeout configuration', () => {
            it('should use config.test.timeouts.cookie for visible wait', async () => {
                await handler.dismissOverlays(mockPage as Page);

                expect(mockCookieBtn.waitFor).toHaveBeenCalledWith({
                    state: 'visible',
                    timeout: 5000,
                });
            });

            it('should use config.test.timeouts.cookie for SDK readiness check', async () => {
                await handler.dismissOverlays(mockPage as Page);

                expect(mockPage.waitForFunction).toHaveBeenCalledWith(expect.any(Function), {
                    timeout: 5000,
                });
            });

            it('should use config.test.timeouts.cookie for hidden wait', async () => {
                await handler.dismissOverlays(mockPage as Page);

                expect(mockCookieBtn.waitFor).toHaveBeenCalledWith(
                    expect.objectContaining({ state: 'hidden', timeout: 5000 })
                );
            });
        });

        describe('correct selector usage', () => {
            it('should use locators.gigantti.cookieBannerAccept as the selector', async () => {
                await handler.dismissOverlays(mockPage as Page);

                const selectorArg = (mockPage.locator as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
                expect(selectorArg).toBe(locators.gigantti.cookieBannerAccept);
            });
        });
    });
});
