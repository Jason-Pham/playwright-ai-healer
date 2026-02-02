import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';
import { CategoryPage } from './CategoryPage.js';

/**
 * Gigantti Home Page
 * Entry point for the Gigantti.fi website
 */
export class GiganttiHomePage extends BasePage {
    private readonly url = config.app.baseUrl;
    private readonly timeouts = config.test.timeouts;
    private popupHandlerRegistered = false;

    // Selectors - using locator keys for self-healing
    private readonly searchInputSelector = 'gigantti.searchInput';
    private readonly realSearchInputSelector = config.app.selectors.gigantti.realSearchInput;

    async open() {
        logger.debug(`Navigating to ${this.url} ...`);
        await this.goto(this.url);
        await this.setupPopupHandler();
        await this.handleCookieConsent();
    }

    /**
     * Register popup handler once per page (only Dynamic Yield marketing popups)
     */
    private async setupPopupHandler() {
        if (this.popupHandlerRegistered) return;

        // Handler for Dynamic Yield marketing popups only
        await this.page.addLocatorHandler(
            this.page.locator('.dy-lb-close, .dy-modal-container .dy-lb-close, .dy-full-width-notifications-close'),
            async (overlay) => {
                logger.debug('AutoHandler: Closing Dynamic Yield popup...');
                await overlay.click();
            }
        );

        this.popupHandlerRegistered = true;
    }

    /**
     * Initial cookie consent handling on page open (proactive, not reactive)
     */
    private async handleCookieConsent() {
        try {
            await this.page.waitForLoadState('domcontentloaded');

            const cookieBtn = this.page.locator('button[aria-label="OK"], .coi-banner__accept, #coiPage-1 .coi-banner__accept').first();

            if (await cookieBtn.isVisible({ timeout: this.timeouts.cookie }).catch(() => false)) {
                logger.debug('Found cookie banner on page load, clicking...');
                await cookieBtn.click({ force: true });
                logger.info('✅ Cookie banner accepted.');
                try {
                    await this.page.waitForFunction(() => !document.body.classList.contains('noScroll'), { timeout: this.timeouts.cookie });
                } catch {
                    // Ignore
                }
            }
        } catch {
            // Ignore - the addLocatorHandler will catch it if it appears later
        }
    }

    /**
     * Search for a product and navigate to search results (CategoryPage)
     */
    async searchFor(term: string): Promise<CategoryPage> {
        logger.debug(`🔍 Searching for "${term}"...`);

        await this.page.waitForLoadState('domcontentloaded');

        // Try multiple search input selectors combined
        const searchSelectors = [
            this.realSearchInputSelector,
            'input[type="search"]',
            'input[placeholder*="search" i]',
            'input[placeholder*="haku" i]',
            '[data-test*="search"] input',
            'header input',
        ];

        const combinedSelector = searchSelectors.join(',');
        const searchInput = this.page.locator(combinedSelector).first();

        try {
            await searchInput.waitFor({ state: 'visible', timeout: this.timeouts.default });
            await this.safeFill(searchInput, term);
            await this.page.keyboard.press('Enter');

            // On WebKit, Enter might not submit. Try clicking search button if exists.
            try {
                const searchBtn = this.page.locator('button[type="submit"], [data-test*="search-button"], [aria-label*="search"], [class*="search-button"]').first();
                if (await searchBtn.isVisible({ timeout: this.timeouts.default })) {
                    await this.safeClick(searchBtn);
                }
            } catch {
                // Ignore if button not found/clickable
            }
        } catch (e) {
            logger.warn(`Could not find standard search input, trying AutoHealer. Error: ${e}`);
            await this.autoHealer.fill(this.searchInputSelector, term);
            await this.page.keyboard.press('Enter');
        }

        // Verify URL after navigation
        const searchPattern = new RegExp(`search\\?q=${encodeURIComponent(term).replace(/%20/g, '\\+')}|search\\?q=${term.replace(/ /g, '\\+')}`);
        logger.debug('✅ Search results page loaded.');

        return new CategoryPage(this.page, this.autoHealer);
    }

    /**
     * Navigate to a product category
     */
    async navigateToCategory(categoryName: string): Promise<CategoryPage> {
        logger.debug(`📂 Navigating to category: ${categoryName}...`);

        // Try multiple approaches to find the category
        const navLink = this.page.locator(`nav a:has-text("${categoryName}"), header a:has-text("${categoryName}")`).first();
        if (await navLink.isVisible({ timeout: this.timeouts.default }).catch(() => false)) {
            await this.safeClick(navLink, { force: true });
        } else {
            const categoryLink = this.page.getByRole('link', { name: new RegExp(categoryName, 'i') }).first();
            await this.safeClick(categoryLink, { force: true, timeout: this.timeouts.default });
        }

        await this.page.waitForLoadState('domcontentloaded');
        logger.debug(`✅ Navigated to ${categoryName} category.`);

        return new CategoryPage(this.page, this.autoHealer);
    }
}
