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

            // Wait for the ROOT wrapper to disappear — this is the element that actually
            // intercepts pointer events in WebKit. Checking only the accept button is
            // insufficient: the button can become hidden while the wrapper stays visible.
            const cookieWrapper = page.locator('#cookie-information-template-wrapper').first();
            await cookieWrapper.waitFor({ state: 'hidden', timeout: config.test.timeouts.cookie }).catch(async () => {
                logger.warn('Cookie banner failed to dismiss normally. Attempting to force hide.');
                // Fallback: Force hide the banner if it's still visible.
                // Uses pointer-events:none in addition to display:none so that even if
                // WebKit's JS re-enables the element, it cannot intercept pointer events.
                await page.evaluate(selector => {
                    const applyHide = (el: HTMLElement) => {
                        el.style.setProperty('display', 'none', 'important');
                        el.style.setProperty('visibility', 'hidden', 'important');
                        el.style.setProperty('pointer-events', 'none', 'important');
                    };

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
                            if (container instanceof HTMLElement) applyHide(container);
                        });
                    }
                    // 2. Try hiding known container IDs directly.
                    // Includes the root wrapper (#cookie-information-template-wrapper) which
                    // is the actual pointer-events blocker in WebKit when child panels like
                    // #coiOverlay and .coi-banner__summary remain visible after SDK dismissal.
                    const knownIds = [
                        'cookie-information-template-wrapper',
                        'coiPage-1',
                        'coiPage-2',
                        'coiPage-3',
                        'coiOverlay',
                        'coi-banner-wrapper',
                    ];
                    for (const id of knownIds) {
                        const el = document.getElementById(id);
                        if (el) applyHide(el);
                    }
                    // 3. Try hiding by common classes.
                    // Includes .coi-banner__summary which is a sibling of #coiOverlay
                    // and intercepts pointer events independently in WebKit.
                    const knownClasses = ['.coi-banner__wrapper', '.coi-banner__container', '.coi-banner__summary'];
                    for (const cls of knownClasses) {
                        document.querySelectorAll(cls).forEach(el => {
                            if (el instanceof HTMLElement) applyHide(el);
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
