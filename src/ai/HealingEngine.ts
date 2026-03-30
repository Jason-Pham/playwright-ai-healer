import type { Page } from '@playwright/test';
import { test } from '@playwright/test';
import { config } from '../config/index.js';
import { logger } from '../utils/Logger.js';
import type { AIClientManager } from './AIClientManager.js';
import { getSimplifiedDOM } from './DOMSerializer.js';
import { parseAIResponse } from './ResponseParser.js';
import { validateSelector } from './SelectorValidator.js';
import { RetryOrchestrator } from './RetryOrchestrator.js';
import type { HealingResult, HealingEvent } from '../types.js';

/**
 * Encapsulates the AI-powered selector healing logic.
 *
 * Given a failed selector and an error, `HealingEngine` captures a DOM snapshot,
 * asks the configured AI provider for a replacement selector, validates the result,
 * and records a `HealingEvent` for reporting.
 *
 * @example
 * ```typescript
 * const engine = new HealingEngine(clientManager);
 * const result = await engine.heal(page, '#broken-selector', error);
 * if (result) {
 *     await page.click(result.selector);
 * }
 * ```
 */
export class HealingEngine {
    private clientManager: AIClientManager;
    private healingEvents: HealingEvent[] = [];

    /**
     * Creates a HealingEngine instance.
     *
     * @param clientManager - AI client manager that handles provider communication,
     *                        key rotation, and provider failover
     */
    constructor(clientManager: AIClientManager) {
        this.clientManager = clientManager;
    }

    /**
     * Returns all healing events recorded during this engine's lifetime.
     */
    getHealingEvents(): readonly HealingEvent[] {
        return this.healingEvents;
    }

    /**
     * Core healing logic -- attempts to find a new selector using AI.
     *
     * Captures a simplified DOM snapshot from the page, constructs a prompt for
     * the AI provider, handles retries / key rotation / provider failover, and
     * validates the returned selector before accepting it.
     *
     * @param page - Playwright page instance to capture the DOM from
     * @param originalSelector - The selector that failed
     * @param error - The error that occurred during the failed interaction
     * @returns A `HealingResult` if a valid replacement selector was found, `null` otherwise
     */
    async heal(page: Page, originalSelector: string, error: Error): Promise<HealingResult | null> {
        const startTime = Date.now();
        logger.info(`[HealingEngine:heal] 🏥 ========== HEALING START ==========`);
        logger.info(`[HealingEngine:heal] 🎯 Original selector: "${originalSelector}"`);
        logger.info(`[HealingEngine:heal] 💥 Error: ${error.message}`);
        logger.info(
            `[HealingEngine:heal] 🤖 Provider: ${this.clientManager.getProvider()}, Model: ${this.clientManager.getModelName()}`
        );
        logger.info(
            `[HealingEngine:heal] 🔑 Available API keys: ${this.clientManager.getKeyCount()}, Current key index: ${this.clientManager.getCurrentKeyIndex()}`
        );

        // 1. Capture simplified DOM
        logger.info(`[HealingEngine:heal] 📸 Step 1: Capturing simplified DOM...`);
        const rawSnapshot = await getSimplifiedDOM(page);
        const htmlSnapshot = rawSnapshot.substring(0, config.ai.healing.domSnapshotCharLimit);
        logger.info(
            `[HealingEngine:heal] 📊 DOM snapshot length: ${htmlSnapshot.length}/${rawSnapshot.length} chars (limit: ${config.ai.healing.domSnapshotCharLimit})`
        );
        logger.debug(`[HealingEngine:heal] DOM snapshot preview (first 500 chars): ${htmlSnapshot.substring(0, 500)}`);

        // 2. Construct Prompt
        logger.info(`[HealingEngine:heal] ✍️ Step 2: Constructing prompt...`);
        const promptText = config.ai.prompts.healingPrompt(originalSelector, error.message, htmlSnapshot);
        logger.info(`[HealingEngine:heal] 📏 Prompt length: ${promptText.length} chars`);
        logger.debug(`[HealingEngine:heal] Prompt preview (first 300 chars): ${promptText.substring(0, 300)}`);

        let healingSuccess = false;
        let healingResult: HealingResult | null = null;
        let tokensUsed: { prompt: number; completion: number; total: number } | undefined;

        try {
            // 3. Execute AI request with automatic retry / key rotation / provider failover
            logger.info(`[HealingEngine:heal] 🔁 Step 3: Starting AI request via RetryOrchestrator`);
            const orchestrator = new RetryOrchestrator(this.clientManager);

            let rawResult: string | undefined;
            try {
                const { result: aiResult } = await orchestrator.execute(() =>
                    this.clientManager.makeRequest(promptText, config.test.timeouts.default)
                );
                rawResult = aiResult.raw;
                tokensUsed = aiResult.tokensUsed;
                logger.info(`[HealingEngine:heal] ✅ AI request succeeded.`);
            } catch {
                // If all retries/rotations/failover exhausted, skip the test
                logger.error(`[HealingEngine:heal] ❌ All retry strategies exhausted. Skipping test.`);
                test.info().annotations.push({
                    type: 'warning',
                    description: 'Test skipped due to AI Client Error',
                });
                test.skip(true, 'Test skipped due to AI Client Error');
                return null;
            }

            // 4. Parse and validate AI result
            logger.info(`[HealingEngine:heal] 🔬 Step 4: Processing AI result. Raw result: "${rawResult}"`);
            const parsed = parseAIResponse(rawResult);

            if (parsed) {
                // Validate selector safety before using it
                if (!validateSelector(parsed)) {
                    logger.warn(
                        `[HealingEngine:heal] 🛡️ HEALING REJECTED. AI-returned selector failed validation: "${parsed}"`
                    );
                } else {
                    // Verify the healed selector actually matches an element on the page
                    const elementCount = await page.locator(parsed).count();
                    const confidence = elementCount > 0 ? 1.0 : 0.0;
                    if (confidence < config.ai.healing.confidenceThreshold) {
                        logger.warn(
                            `[HealingEngine:heal] 🛡️ HEALING REJECTED. Healed selector "${parsed}" matched 0 elements (confidence=${confidence} < threshold=${config.ai.healing.confidenceThreshold})`
                        );
                    } else {
                        healingSuccess = true;
                        healingResult = {
                            selector: parsed,
                            confidence,
                            reasoning: 'AI found replacement selector.',
                            strategy: 'css',
                        };
                        logger.info(`[HealingEngine:heal] ✨ HEALING SUCCEEDED! New selector: "${parsed}"`);
                    }
                }
            } else {
                logger.warn(`[HealingEngine:heal] 💔 HEALING FAILED. Result was: "${rawResult}" (FAIL or empty)`);
            }
        } catch (aiError) {
            const aiErrorTyped = aiError as Error;
            logger.error(`[HealingEngine:heal] 🚨 HEALING EXCEPTION: ${aiErrorTyped.message || String(aiErrorTyped)}`);
            // If it's a skip error, re-throw it so Playwright skips the test
            if (
                String(aiErrorTyped).includes('Test skipped') ||
                aiErrorTyped.message?.includes('Test skipped') ||
                aiErrorTyped.message?.includes('Test is skipped')
            ) {
                logger.info(`[HealingEngine:heal] ⏩ Re-throwing skip error to Playwright.`);
                throw aiErrorTyped;
            }
            logger.error(
                `[HealingEngine:heal] ❌ AI Healing failed (${this.clientManager.getProvider()}): ${aiErrorTyped.message || String(aiErrorTyped)}`
            );
        } finally {
            const durationMs = Date.now() - startTime;
            logger.info(`[HealingEngine:heal] 🏁 ========== HEALING END (${durationMs}ms) ==========`);
            logger.info(
                `[HealingEngine:heal] 📋 Success: ${healingSuccess}, Result: ${healingResult ? healingResult.selector : 'null'}`
            );
            // Record the healing event
            this.healingEvents.push({
                timestamp: new Date().toISOString(),
                originalSelector,
                result: healingResult,
                ...(healingSuccess ? {} : { error: error.message }),
                success: healingSuccess,
                provider: this.clientManager.getProvider(),
                durationMs,
                ...(tokensUsed ? { tokensUsed } : {}),
                domSnapshotLength: htmlSnapshot.length,
            });
        }

        return healingResult;
    }
}
