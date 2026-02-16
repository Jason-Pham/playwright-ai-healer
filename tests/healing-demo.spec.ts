import { test, expect } from './fixtures/base.js';
import { config } from '../src/config/index.js';

/**
 * Healing Demo Tests
 *
 * These tests intentionally use broken selectors to demonstrate the self-healing
 * capability. The AutoHealer will detect the broken selector, ask the AI for a
 * fix, and retry with the corrected selector.
 */
test.describe('Self-Healing Demo', () => {
    test('should heal a broken search button selector', async ({ giganttiPage, autoHealer }) => {
        // Use POM to open the page
        await giganttiPage.open();

        // Use the POM's "safeFill" function with a correct selector
        await giganttiPage.safeFill('#speedy-header-search', 'laptop');

        // Intentionally use a BROKEN selector with the POM's "safeClick" function
        // This demonstrates that POM functions are now self-healing!
        await giganttiPage.safeClick('#nonexistent-search-button-xyz-12345', { timeout: config.test.timeouts.short });

        // Verify the results using the POM's page instance
        await expect(giganttiPage.page).toHaveURL(/search|haku|query/, { timeout: config.test.timeouts.default });

        // Verify the healing events were recorded
        const events = autoHealer.getHealingEvents();
        expect(events.length).toBeGreaterThan(0);
        expect(events[0]?.success).toBe(true);
    });
});
