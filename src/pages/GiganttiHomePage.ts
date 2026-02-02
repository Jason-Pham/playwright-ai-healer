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

    // Selectors - using locator keys for self-healing
    private readonly searchInputSelector = 'gigantti.searchInput';
    private readonly realSearchInputSelector = config.app.selectors.gigantti.realSearchInput;

    async open() {
        logger.debug(`Navigating to ${this.url} ...`);
        await this.goto(this.url);
        await this.handleCookieConsent();
    }

    private async handleCookieConsent() {
        try {
            logger.debug('Checking for cookie banner...');

            const acceptSelectors = [
                'button.coi-banner__accept',
                '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
                'button:has-text("OK")',
                'button:has-text("Hyväksy")',
                '[id*="cookie"] button:has-text("OK")',
            ];

            for (const selector of acceptSelectors) {
                const cookieBtn = this.page.locator(selector).first();
                if (await cookieBtn.isVisible({ timeout: this.timeouts.cookieBanner }).catch(() => false)) {
                    await cookieBtn.click({ force: true });
                    logger.info('✅ Cookie banner accepted.');
                    await this.page.waitForTimeout(this.timeouts.cookieBannerWait);
                    return;
                }
            }

            logger.debug('ℹ️ Cookie banner not found or already accepted.');
        } catch (e) {
            logger.debug(`ℹ️ Ignored cookie banner error: ${e}`);
        }
    }

    /**
     * Search for a product and navigate to search results (CategoryPage)
     */
    async searchFor(term: string): Promise<CategoryPage> {
        logger.debug(`🔍 Searching for "${term}"...`);

        // Wait for page to stabilize
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
            // Wait for input to be visible
            await searchInput.waitFor({ state: 'visible', timeout: 5000 });
            await searchInput.fill(term);
            await this.page.keyboard.press('Enter');
        } catch (e) {
            logger.warn(`Could not find standard search input, trying AutoHealer. Error: ${e}`);
            // Fallback: use autohealer
            await this.autoHealer.fill(this.searchInputSelector, term);
            await this.page.keyboard.press('Enter');
        }

        // Wait for search results to load
        await this.page.waitForLoadState('domcontentloaded');
        await expect(this.page).toHaveURL(/search/);
        logger.debug('✅ Search results page loaded.');

        return new CategoryPage(this.page, this.autoHealer);
    }

    /**
     * Navigate to a product category
     */
    async navigateToCategory(categoryName: string): Promise<CategoryPage> {
        logger.debug(`📂 Navigating to category: ${categoryName}...`);

        await this.dismissOverlays();

        // Try multiple approaches to find the category
        const navLink = this.page.locator(`nav a:has-text("${categoryName}"), header a:has-text("${categoryName}")`).first();
        if (await navLink.isVisible({ timeout: this.timeouts.navigation }).catch(() => false)) {
            await navLink.click({ force: true });
        } else {
            const categoryLink = this.page.getByRole('link', { name: new RegExp(categoryName, 'i') }).first();
            await categoryLink.click({ force: true, timeout: this.timeouts.categoryFallback });
        }

        await this.page.waitForLoadState('domcontentloaded');
        logger.debug(`✅ Navigated to ${categoryName} category.`);

        return new CategoryPage(this.page, this.autoHealer);
    }

    /**
     * Dismiss any overlay modals (cookie banners, popups, etc.)
     */
    private async dismissOverlays() {
        try {
            const overlaySelectors = [
                '#cookie-information-template-wrapper button:has-text("OK")',
                '[id*="cookie"] button',
                '.modal-close',
                '[aria-label="Close"]',
            ];

            for (const selector of overlaySelectors) {
                const overlay = this.page.locator(selector).first();
                if (await overlay.isVisible({ timeout: this.timeouts.overlayCheck }).catch(() => false)) {
                    await overlay.click({ force: true });
                    await this.page.waitForTimeout(this.timeouts.overlayWait);
                }
            }
        } catch {
            // Ignore errors - overlays are optional
        }
    }
}
