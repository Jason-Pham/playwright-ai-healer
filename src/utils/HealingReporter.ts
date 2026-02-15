import type { TestInfo } from '@playwright/test';
import type { HealingEvent } from '../types.js';
import { logger } from './Logger.js';

/**
 * HealingReporter - Records and reports self-healing events
 *
 * Collects healing events during a test run and attaches them to the
 * Playwright HTML report for visibility.
 *
 * @example
 * ```typescript
 * const reporter = new HealingReporter();
 * reporter.record(event);
 * reporter.attach(testInfo); // Attaches to Playwright report
 * ```
 */
export class HealingReporter {
    private events: HealingEvent[] = [];

    /**
     * Record a healing event
     */
    record(event: HealingEvent): void {
        this.events.push(event);
        const status = event.success ? '✅ Healed' : '❌ Failed';
        const confidence = event.result?.confidence
            ? ` (confidence: ${(event.result.confidence * 100).toFixed(0)}%)`
            : '';
        logger.info(
            `[HealingReporter] ${status}: "${event.originalSelector}" → "${event.result?.selector ?? 'N/A'}"${confidence} [${event.durationMs}ms]`
        );
    }

    /**
     * Get all recorded events
     */
    getEvents(): readonly HealingEvent[] {
        return this.events;
    }

    /**
     * Check if any healing occurred
     */
    hasEvents(): boolean {
        return this.events.length > 0;
    }

    /**
     * Get a summary of healing events
     */
    getSummary(): { total: number; healed: number; failed: number } {
        return {
            total: this.events.length,
            healed: this.events.filter((e) => e.success).length,
            failed: this.events.filter((e) => !e.success).length,
        };
    }

    /**
     * Attach healing report to Playwright test info as a JSON attachment.
     * Only attaches if there are events to report.
     */
    async attach(testInfo: TestInfo): Promise<void> {
        if (!this.hasEvents()) return;

        const summary = this.getSummary();
        const report = {
            summary,
            events: this.events,
        };

        await testInfo.attach('healing-report', {
            body: JSON.stringify(report, null, 2),
            contentType: 'application/json',
        });

        // Also add a human-readable annotation
        testInfo.annotations.push({
            type: 'healing',
            description: `Self-healing: ${summary.healed}/${summary.total} selectors healed`,
        });
    }

    /**
     * Reset events (call between tests)
     */
    clear(): void {
        this.events = [];
    }
}
