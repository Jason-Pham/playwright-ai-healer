import { BasePage } from './BasePage.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/index.js';
import { CategoryPage } from './CategoryPage.js';
import locators from '../config/locators.json' with { type: "json" };

const { searchInput } = locators.gigantti;

/**
 * Gigantti Home Page
 * Entry point for the Gigantti.fi website
 */
export class GiganttiHomePage extends BasePage {
    private readonly url = config.app.baseUrl;
    private readonly timeouts = config.test.timeouts;
    private popupHandlerRegistered = false;

    async open() {
        logger.debug(`Navigating to ${this.url} ...`);
        await this.goto(this.url);
        await this.setupPopupHandler();
    }

    /**
     * Register popup handler once per page (only Dynamic Yield marketing popups)
     */
    private async setupPopupHandler() {
        if (this.popupHandlerRegistered) return;

        // Handler for Dynamic Yield marketing popups only
        await this.page.addLocatorHandler(
            this.page.locator('.dy-lb-close, .dy-modal-container .dy-lb-close, .dy-full-width-notifications-close'),
            async overlay => {
                logger.debug('AutoHandler: Closing Dynamic Yield popup...');
                await overlay.click();
            }
        );

        this.popupHandlerRegistered = true;
    }

    /**
     * Search for a product and navigate to search results (CategoryPage)
     */
    async searchFor(term: string): Promise<CategoryPage> {
        logger.debug(`🔍 Searching for "${term}"...`);

        await this.safeFill(this.page.locator(searchInput), term);

        const searchBtn = this.page
            .locator('[data-testid="search-button"]')
            .first();

        await this.waitForPageLoad({ networking: true, timeout: this.timeouts.default });
        await this.safeClick(searchBtn);

        return new CategoryPage(this.page, this.autoHealer);
    }

    /**
     * Navigate to a product category
     */
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
