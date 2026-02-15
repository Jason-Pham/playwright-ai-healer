import { test, expect } from './fixtures/base.js';
import { config } from '../src/config/index.js';

/**
 * Healing Demo Tests
 *
 * These tests intentionally use broken selectors to demonstrate the self-healing
 * capability. The AutoHealer will detect the broken selector, ask the AI for a
 * fix, and retry with the corrected selector.
 *
 * After each test, the healing report is attached to the Playwright HTML report
 * as a JSON artifact showing: original selector, healed selector, confidence,
 * reasoning, and duration.
 */
test.describe('Self-Healing Demo', () => {
    test('should heal a broken search button selector', async ({ page, autoHealer }) => {
        await page.goto(config.app.baseUrl);

        // Use the correct selector for the search input (no healing needed)
        await page.fill('#speedy-header-search', 'laptop', { timeout: config.test.timeouts.default });

        // Intentionally use a BROKEN selector for the search button
        // The AI should find the correct selector from the DOM
        await autoHealer.click('#nonexistent-search-button-xyz-12345', { timeout: config.test.timeouts.short });

        // If we got here, the healer successfully found and clicked the search button
        // Verify we navigated to search results
        await expect(page).toHaveURL(/search|haku|query/, { timeout: config.test.timeouts.default });

        // Verify the healing events were recorded
        const events = autoHealer.getHealingEvents();
        expect(events.length).toBeGreaterThan(0);
        expect(events[0]?.success).toBe(true);
    });

    test('should report failure for an impossible selector', async ({ page, autoHealer }) => {
        await page.goto(config.app.baseUrl);

        // This selector is so wrong that even AI can't find a match
        // The test should fail gracefully with the healing attempt logged
        try {
            await autoHealer.click('[data-testid="absolutely-impossible-element-that-does-not-exist-anywhere"]');
        } catch {
            // Expected: the selector can't be healed
        }

        // Verify healing was attempted and recorded
        const events = autoHealer.getHealingEvents();
        expect(events.length).toBeGreaterThan(0);
    });
});
