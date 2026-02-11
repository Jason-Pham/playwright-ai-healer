import { BasePage } from './BasePage.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';
import { LocatorManager } from '../utils/LocatorManager.js';
import { CategoryPage } from './CategoryPage.js';

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

        // Resolve selector dynamically from LocatorManager to pick up any healed values
        const searchInputSelector = this.locatorManager.getLocator('gigantti.searchInput');

        if (!searchInputSelector) {
            throw new Error('Search input selector not found in locators.json');
        }

        await this.safeFill(this.page.locator(searchInputSelector), term, { force: true });

        const searchBtn = this.page.locator('[data-testid="search-button"]').first();

        await this.expectValue(this.page.locator(searchInputSelector), term);
        await this.safeClick(searchBtn);

        return new CategoryPage(this.page, this.autoHealer);
    }

    async navigateToCategory(categoryName: string): Promise<CategoryPage> {
        logger.debug(`📂 Navigating to category: ${categoryName}...`);

        // Try multiple approaches to find the category
        const navLink = this.page
            .locator(`nav a:has-text("${categoryName}"), header a:has-text("${categoryName}")`)
            .first();
        if (await navLink.isVisible({ timeout: this.timeouts.default }).catch(() => false)) {
            await this.safeClick(navLink, { force: true });
        } else {
            const categoryLink = this.page.getByRole('link', { name: new RegExp(categoryName, 'i') }).first();
            await this.safeClick(categoryLink, { force: true, timeout: this.timeouts.default });
        }

        await this.waitForPageLoad({ networking: true, timeout: this.timeouts.default });
        logger.debug(`✅ Navigated to ${categoryName} category.`);

        return new CategoryPage(this.page, this.autoHealer);
    }
}
