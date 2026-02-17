import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as lockfile from 'proper-lockfile';
import { logger } from './Logger.js';
import type { LocatorStore } from '../types.js';

// Get current directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LocatorManager - Manages persistent storage of element selectors
 *
 * Provides centralized storage for selectors that can be updated when
 * the AutoHealer discovers new working selectors.
 *
 * @example
 * ```typescript
 * const manager = LocatorManager.getInstance();
 * const selector = manager.getLocator('home.searchButton');
 * manager.updateLocator('home.searchButton', '#new-search-btn');
 * ```
 */
export class LocatorManager {
    private static instance: LocatorManager;
    private locatorsPath: string;
    private locators: LocatorStore = {};

    private constructor() {
        // Resolve path relative to this file (src/utils -> src/config/locators.json)
        this.locatorsPath = path.resolve(__dirname, '../config/locators.json');
        this.loadLocators();
    }

    /**
     * Get the singleton instance of LocatorManager
     */
    public static getInstance(): LocatorManager {
        if (!LocatorManager.instance) {
            LocatorManager.instance = new LocatorManager();
        }
        return LocatorManager.instance;
    }

    private loadLocators() {
        try {
            if (fs.existsSync(this.locatorsPath)) {
                const fileContent = fs.readFileSync(this.locatorsPath, 'utf-8');
                this.locators = JSON.parse(fileContent) as LocatorStore;
            } else {
                this.locators = {};
                logger.warn(`[LocatorManager] Locators file not found at ${this.locatorsPath}`);
            }
        } catch (error) {
            logger.error(`[LocatorManager] Failed to load locators: ${String(error)}`);
            this.locators = {};
        }
    }

    /**
     * Get a locator by its key path (e.g., 'home.searchButton')
     *
     * @param key - Dot-separated path to the locator
     * @returns The selector string if found, null otherwise
     */
    public getLocator(key: string): string | null {
        try {
            const parts = key.split('.');
            let current: string | LocatorStore | undefined = this.locators;

            for (const part of parts) {
                if (current === undefined || current === null || typeof current === 'string') return null;
                current = current[part] as string | LocatorStore;
            }

            return typeof current === 'string' ? current : null;
        } catch (error) {
            logger.error(`[LocatorManager] Error retrieving locator for key '${key}': ${String(error)}`);
            return null;
        }
    }

    /**
     * Update a locator with a new selector value
     *
     * Creates nested paths if they don't exist and persists changes to disk.
     *
     * @param key - Dot-separated path to the locator
     * @param newSelector - New CSS selector value
     */
    public async updateLocator(key: string, newSelector: string): Promise<void> {
        let release: (() => Promise<void>) | undefined;

        try {
            // Wait for lock with retries
            release = await lockfile.lock(this.locatorsPath, {
                retries: {
                    retries: 5,
                    factor: 2,
                    minTimeout: 100,
                    maxTimeout: 1000,
                },
            });

            // Re-read file to get latest state after acquiring lock
            this.loadLocators();

            const parts = key.split('.');
            let current: LocatorStore = this.locators;

            // Traverse to the second to last part
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (part === undefined) continue;

                if (current === null || typeof current !== 'object') {
                    throw new Error(`Cannot traverse path segment '${part}'`);
                }
                if (!current[part] || typeof current[part] === 'string') {
                    current[part] = {};
                }
                const next = current[part];
                if (typeof next === 'string') {
                    throw new Error(`Cannot traverse through string value at '${part}'`);
                }
                current = next;
            }

            // Set the new value
            const lastPart = parts[parts.length - 1];
            if (current && typeof current === 'object' && lastPart !== undefined) {
                current[lastPart] = newSelector;
            }

            // Save to file
            this.saveLocators();
            logger.info(`[LocatorManager] Updated locator '${key}' to '${newSelector}'`);
        } catch (error) {
            logger.error(`[LocatorManager] Failed to update locator '${key}': ${String(error)}`);
        } finally {
            if (release) {
                await release();
            }
        }
    }

    private saveLocators() {
        try {
            fs.writeFileSync(this.locatorsPath, JSON.stringify(this.locators, null, 2), 'utf-8');
        } catch (error) {
            logger.error(`[LocatorManager] Failed to save locators: ${String(error)}`);
        }
    }
}
