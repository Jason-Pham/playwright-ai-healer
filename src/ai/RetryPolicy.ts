import { test } from '@playwright/test';
import { logger } from '../utils/Logger.js';
import type { AIError } from '../types.js';
import type { IAIClient } from './AIClient.js';

/**
 * RetryPolicy — Handles API retry logic, key rotation, and error classification.
 *
 * Extracted from AutoHealer's heal() method for single-responsibility,
 * testability, and reusability.
 */
export class RetryPolicy {
    private apiKeys: string[];
    private currentKeyIndex: number;
    private client: IAIClient & { reinitialize(apiKey: string): void };

    constructor(
        client: IAIClient & { reinitialize(apiKey: string): void },
        apiKeys: string[],
        startKeyIndex = 0
    ) {
        this.client = client;
        this.apiKeys = apiKeys;
        this.currentKeyIndex = startKeyIndex;
    }

    /** Get the current key index (useful for diagnostics) */
    get keyIndex(): number {
        return this.currentKeyIndex;
    }

    /** Get the total number of keys */
    get keyCount(): number {
        return this.apiKeys.length;
    }

    /**
     * Execute an AI query with full retry, backoff, and key rotation logic.
     *
     * @param prompt - The prompt to send to the AI
     * @param timeoutMs - Timeout per request in ms
     * @param maxRetries - Max retries per key on server errors
     * @returns The raw AI response string, or undefined on failure
     * @throws On rate limits (via test.skip) or when all keys exhausted
     */
    async executeWithRetry(prompt: string, timeoutMs: number, maxRetries = 3): Promise<string | undefined> {
        const maxKeyRotations = this.apiKeys.length;
        let result: string | undefined;

        logger.info(`[RetryPolicy] Starting AI request (maxKeyRotations=${maxKeyRotations})`);

        keyLoop: for (let k = 0; k < maxKeyRotations; k++) {
            let retryCount = 0;
            logger.info(`[RetryPolicy] Key iteration=${k}, keyIndex=${this.currentKeyIndex}`);

            while (retryCount <= maxRetries) {
                logger.info(`[RetryPolicy] Attempt: key=${k}, retry=${retryCount}/${maxRetries}`);
                try {
                    result = await this.client.query(prompt, timeoutMs);
                    logger.info(`[RetryPolicy] AI request succeeded.`);
                    break keyLoop;
                } catch (reqError) {
                    const classified = this.classifyError(reqError as AIError);

                    if (classified === 'server') {
                        if (retryCount < maxRetries) {
                            retryCount++;
                            const delay = Math.pow(2, retryCount) * 1000;
                            logger.warn(
                                `[RetryPolicy] Server Error. Retrying in ${delay / 1000}s... (${retryCount}/${maxRetries})`
                            );
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        } else {
                            logger.error(`[RetryPolicy] Server Error after ${maxRetries} retries. Giving up.`);
                            throw reqError;
                        }
                    }

                    if (classified === 'rateLimit') {
                        logger.warn(`[RetryPolicy] Rate limit detected. Skipping test.`);
                        test.info().annotations.push({
                            type: 'warning',
                            description: 'Test skipped due to AI Rate Limit',
                        });
                        test.skip(true, 'Test skipped due to AI Rate Limit');
                        return undefined; // unreachable if test.skip throws
                    }

                    if (classified === 'auth') {
                        logger.warn(`[RetryPolicy] Auth Error. Attempting key rotation...`);
                        const rotated = this.rotateKey();
                        if (rotated) {
                            continue keyLoop;
                        } else {
                            logger.error('[RetryPolicy] No more API keys to try.');
                            throw reqError;
                        }
                    }

                    // Client error (4xx) — skip test
                    if (classified === 'clientError') {
                        logger.warn(`[RetryPolicy] Client Error (4xx). Skipping test.`);
                        test.skip(true, 'Test skipped due to Client Error (4xx) from AI provider.');
                        return undefined;
                    }

                    logger.error(`[RetryPolicy] Unhandled error type. Re-throwing.`);
                    throw reqError;
                }
            }
        }

        return result;
    }

    /**
     * Classify an AI error into a category for retry logic.
     */
    private classifyError(error: AIError): 'server' | 'rateLimit' | 'auth' | 'clientError' | 'unknown' {
        const msg = error.message?.toLowerCase() ?? '';
        const status = error.status;

        logger.error(`[RetryPolicy] Error: status=${status}, message="${error.message}"`);

        // Server errors (5xx, timeouts)
        if (
            (status && status >= 500) ||
            msg.includes('503') || msg.includes('500') ||
            msg.includes('service unavailable') || msg.includes('overloaded') ||
            msg.includes('internal server error') || msg.includes('bad gateway') ||
            msg.includes('timed out')
        ) {
            return 'server';
        }

        // Rate limits
        if (
            status === 429 || msg.includes('429') ||
            msg.includes('rate limit') || msg.includes('resource exhausted') ||
            msg.includes('insufficient quota')
        ) {
            return 'rateLimit';
        }

        // Auth errors
        if (status === 401 || msg.includes('401')) {
            return 'auth';
        }

        // Other client errors
        if (status && status >= 400 && status < 500) {
            return 'clientError';
        }

        return 'unknown';
    }

    /**
     * Rotate to the next API key.
     */
    private rotateKey(): boolean {
        if (this.currentKeyIndex < this.apiKeys.length - 1) {
            this.currentKeyIndex++;
            const apiKey = this.apiKeys[this.currentKeyIndex];
            if (apiKey) {
                this.client.reinitialize(apiKey);
                logger.info(`[RetryPolicy] Rotated to key #${this.currentKeyIndex + 1}`);
            }
            return true;
        }
        return false;
    }
}
