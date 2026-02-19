import { BasePage } from './BasePage.js';
import { expect } from '@playwright/test';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';
import { LocatorManager } from '../utils/LocatorManager.js';
import { CategoryPage } from './CategoryPage.js';

import locators from '../config/locators.json' with { type: 'json' };

const { searchInput, searchButton, navLink } = locators.gigantti;

export class GiganttiHomePage extends BasePage {
    private readonly url = config.app.baseUrl;
    private readonly timeouts = config.test.timeouts;
    private readonly locatorManager = LocatorManager.getInstance();
    private popupHandlerRegistered = false;

    async open() {
        logger.debug(`Navigating to ${this.url} ...`);
        await this.goto(this.url);
        await this.dismissOverlaysBeforeAction();
    }

    async searchFor(term: string): Promise<CategoryPage> {
        logger.debug(`🔍 Searching for "${term}"...`);

        const inputLocator = this.page.locator(searchInput);

        // Retry logic to handle race conditions where input might be cleared by site hydration
        await expect(async () => {
            await this.safeFill(inputLocator, term, { force: true });
            // Small wait to ensure value persists (catch hydration clearing)
            await this.page.waitForTimeout(this.timeouts.stabilization);
            await expect(inputLocator).toHaveValue(term, { timeout: this.timeouts.short });
        }).toPass({ timeout: this.timeouts.default });

        const searchBtn = this.page.locator(searchButton).first();
        await this.safeClick(searchBtn);

        return new CategoryPage(this.page, this.autoHealer, this.siteHandler);
    }

    async navigateToCategory(categoryName: string): Promise<CategoryPage> {
        logger.debug(`📂 Navigating to category: ${categoryName}...`);

        // Try multiple approaches to find the category
        const linkSelector = navLink.replace(/{}/g, categoryName);
        const navigationLink = this.page.locator(linkSelector).first();

        if (await navigationLink.isVisible({ timeout: this.timeouts.default }).catch(() => false)) {
            await this.safeClick(navigationLink, { force: true });
        } else {
            const categoryLink = this.page.getByRole('link', { name: new RegExp(categoryName, 'i') }).first();
            await this.safeClick(categoryLink, { force: true, timeout: this.timeouts.default });
        }

        await this.waitForPageLoad({ networking: true, timeout: this.timeouts.default });
        logger.debug(`✅ Navigated to ${categoryName} category.`);

        return new CategoryPage(this.page, this.autoHealer, this.siteHandler);
    }
}
