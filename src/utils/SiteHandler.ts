import type { Page } from '@playwright/test';
import { config } from '../config/index.js';
import { logger } from './Logger.js';

import locators from '../config/locators.json' with { type: 'json' };

/**
 * SiteHandler - Strategy interface for site-specific overlay dismissal.
 *
 * Implement this interface to handle cookie banners, consent dialogs, or any
 * other overlay that must be dismissed before page interactions can proceed.
 * Register your implementation via the `BasePage` constructor.
 */
export interface SiteHandler {
    /**
     * Dismiss any overlays (cookie banners, consent dialogs, etc.) on the given page.
     *
     * Implementations should be idempotent — safe to call multiple times. If no overlay
     * is present, this method should return without error.
     *
     * @param page - Playwright page instance to operate on.
     */
    dismissOverlays(page: Page): Promise<void>;
}

/**
 * GiganttiHandler - SiteHandler implementation for gigantti.fi.
 *
 * Dismisses the CookieInformation SDK consent banner by waiting for it to become
 * visible and then accepting it. Silently no-ops if the banner never appears.
 */
export class GiganttiHandler implements SiteHandler {
    async dismissOverlays(page: Page): Promise<void> {
        // Handle Gigantti cookie consent banner using CookieInformation SDK API.
        const cookieBtnSelector = locators.gigantti.cookieBannerAccept;
        const cookieBtn = page.locator(cookieBtnSelector).first();

        try {
            // Wait for cookie banner to appear (it renders asynchronously after page load).
            // If it doesn't appear within the timeout, there's no banner to dismiss.
            await cookieBtn.waitFor({ state: 'visible', timeout: config.test.timeouts.cookie });
        } catch {
            // Banner didn't appear — nothing to dismiss
            return;
        }

        try {
            // Wait for CookieInformation SDK to be fully initialized.
            // This replaces the old waitForResponse(cabl.json) which had a race
            // condition: if the response arrived before the listener was set up,
            // it would needlessly wait for the full timeout duration.
            await page
                .waitForFunction(() => (window as any).isCookieInformationAPIReady === true, {
                    timeout: config.test.timeouts.cookie,
                })
                .catch(() => {
                    // SDK not ready in time — proceed to fallback click
                });

            logger.debug('Dismissing Gigantti cookie banner...');

            // Use SDK API to accept all cookies; fall back to direct click
            await page.evaluate(selector => {
                const ci = (window as any).CookieInformation;
                if (typeof ci?.submitAllCategories === 'function') {
                    ci.submitAllCategories();
                } else {
                    // Try to find the button using the provided comma-separated selectors
                    const selectors = selector.split(',').map(s => s.trim());
                    let btn: HTMLElement | null = null;

                    for (const s of selectors) {
                        btn = document.querySelector<HTMLElement>(s);
                        if (btn) break;
                    }

                    btn?.click();
                }
            }, cookieBtnSelector);

            // Wait for the banner to disappear
            await cookieBtn.waitFor({ state: 'hidden', timeout: config.test.timeouts.cookie }).catch(async () => {
                logger.warn('Cookie banner failed to dismiss normally. Attempting to force hide.');
                // Fallback: Force hide the banner if it's still visible
                await page.evaluate(selector => {
                    const selectors = selector.split(',').map(s => s.trim());
                    // 1. Try hiding based on the button's ancestors
                    for (const s of selectors) {
                        const elements = document.querySelectorAll(s);
                        elements.forEach(el => {
                            // Walk up to find the container
                            const container =
                                el.closest('#coiPage-1') ||
                                el.closest('.coi-banner__wrapper') ||
                                el.closest('[role="dialog"]') ||
                                el;
                            if (container instanceof HTMLElement) {
                                container.style.display = 'none';
                                container.style.visibility = 'hidden';
                                container.style.setProperty('display', 'none', 'important');
                            }
                        });
                    }
                    // 2. Try hiding known container IDs directly
                    const knownIds = ['coiPage-1', 'coiPage-2', 'coiPage-3', 'coiOverlay', 'coi-banner-wrapper'];
                    for (const id of knownIds) {
                        const el = document.getElementById(id);
                        if (el) {
                            el.style.display = 'none';
                            el.style.visibility = 'hidden';
                            el.style.setProperty('display', 'none', 'important');
                        }
                    }
                    // 3. Try hiding by common classes
                    const knownClasses = ['.coi-banner__wrapper', '.coi-banner__container'];
                    for (const cls of knownClasses) {
                        document.querySelectorAll(cls).forEach(el => {
                            if (el instanceof HTMLElement) {
                                el.style.display = 'none';
                                el.style.visibility = 'hidden';
                                el.style.setProperty('display', 'none', 'important');
                            }
                        });
                    }
                }, cookieBtnSelector);
            });
        } catch (error) {
            logger.warn(`Error dismissing cookie banner: ${error}`);
        }
    }
}

/**
 * NoOpHandler - No-operation SiteHandler for sites that have no overlays.
 *
 * Use this as the `siteHandler` argument to `BasePage` when the target site
 * does not require any overlay dismissal.
 */
export class NoOpHandler implements SiteHandler {
    async dismissOverlays(_page: Page): Promise<void> {
        // Do nothing
    }
}
