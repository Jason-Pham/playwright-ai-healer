import { BasePage } from './BasePage.js';
import { CategoryPage } from './CategoryPage.js';
import { config, type CategoryKey, type SubCategoryKey } from '../config/index.js';
import { logger } from '../utils/Logger.js';

import locators from '../config/locators.json' with { type: 'json' };

/**
 * Represents the Gigantti category navigation menu.
 * Provides typed access to top-level categories and their subcategories.
 */
export class CategoryMenuPage extends BasePage {
    /**
     * Navigate to a category (and optionally a subcategory within it).
     *
     * @example
     * await menu.select('computers');             // → Tietotekniikka landing page
     * await menu.select('computers', 'laptops');  // → Kannettavat tietokoneet listing
     */
    async select<K extends CategoryKey>(key: K, subcategoryKey?: SubCategoryKey<K>): Promise<CategoryPage> {
        const categoryLabel = config.testData.categories[key].label;
        logger.debug(`📂 Navigating to category: ${categoryLabel}...`);
        await this._navigateByLabel(categoryLabel);

        if (subcategoryKey !== undefined) {
            const subcats = config.testData.categories[key].subcategories as Record<string, string>;
            const subLabel = subcats[subcategoryKey as string] ?? String(subcategoryKey);
            logger.debug(`📂 Navigating to subcategory: ${subLabel}...`);
            await this._navigateByLabel(subLabel);
        }

        logger.debug(`✅ Navigated to ${categoryLabel}${subcategoryKey ? ` › ${String(subcategoryKey)}` : ''}.`);
        return new CategoryPage(this.page, this.autoHealer, this.siteHandler);
    }

    private async _navigateByLabel(label: string): Promise<void> {
        const timeouts = config.test.timeouts;
        const xpathSelector = locators.gigantti.navLink.replace(/{}/g, label);
        const xpathLink = this.page.locator(xpathSelector).first();

        // Race isVisible() against the security-challenge signal so the test skips
        // immediately when status 708 is detected, rather than waiting the full timeout.
        let visible = false;
        try {
            visible = await this.withSecurityCheck(() => xpathLink.isVisible({ timeout: timeouts.default }));
        } catch {
            this.checkSecurityChallenge(); // skip if challenge fired; otherwise isVisible timed out
        }
        if (visible) {
            await this.safeClick(xpathLink, { force: true });
        } else {
            // Exclude product cards so we only match navigation links, not search results
            const roleLink = this.page
                .locator('a:not([data-testid="product-card"])')
                .filter({ hasText: new RegExp(label, 'i') })
                .first();
            await this.safeClick(roleLink, { force: true, timeout: timeouts.default });
        }

        await this.waitForPageLoad({ networking: true, timeout: timeouts.default });
    }
}
