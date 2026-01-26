import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { AutoHealer } from '../AutoHealer.js';
import { BasePage } from './BasePage.js';

import { config } from '../config/index.js';

export class GiganttiHomePage extends BasePage {
    private readonly url = config.app.baseUrl;

    // Selectors
    // Intentionally broken selector to demonstrate self-healing
    private readonly searchInputSelector = config.app.selectors.gigantti.searchInput;
    private readonly cookieBannerAcceptSelector = config.app.selectors.gigantti.cookieBannerAccept;
    private readonly realSearchInputSelector = config.app.selectors.gigantti.realSearchInput;

    constructor(page: Page, autoHealer: AutoHealer) {
        super(page, autoHealer);
    }

    async open() {
        console.log(`Navigating to ${this.url} ...`);
        await this.goto(this.url);
        await this.handleCookieConsent();
    }

    private async handleCookieConsent() {
        try {
            console.log('Checking for cookie banner...');
            const cookieBtn = this.page.locator(this.cookieBannerAcceptSelector);
            if (await cookieBtn.isVisible({ timeout: config.test.timeouts.check })) {
                await cookieBtn.click();
                console.log('✅ Cookie banner accepted.');
            } else {
                console.log('ℹ️ Cookie banner not found or already accepted.');
            }
        } catch (e) {
            console.log('ℹ️ Ignored cookie banner error:', e);
        }
    }

    async searchFor(term: string) {
        console.log(`\n🧪 Attempting to search for "${term}" using broken selector: "${this.searchInputSelector}"`);

        // This uses the AutoHealer instance passed via constructor
        // If the selector fails, AutoHealer will attempt to find the correct element
        await this.autoHealer.fill(this.searchInputSelector, term);

        // Verify the input actually contains the text (sanity check on the result)
        // We use the known real selector for verification to ensure the heuristic was correct
        await expect(this.page.locator(this.realSearchInputSelector)).toHaveValue(term);

        await this.page.keyboard.press('Enter');
    }

    async verifySearchResultsLoaded() {
        await expect(this.page).toHaveURL(/search/);
        console.log('✅ Search results page loaded.');
    }
}
