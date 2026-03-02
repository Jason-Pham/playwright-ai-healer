import { logger } from './Logger.js';
import { createLocatorAdapter, type LocatorAdapter } from './LocatorAdapter.js';
import { config } from '../config/index.js';

/**
 * LocatorManager - Manages persistent storage of element selectors
 *
 * Acts as a facade over a pluggable `LocatorAdapter`. The active backend is
 * chosen at startup via the `LOCATOR_STORE` environment variable:
 *
 *   LOCATOR_STORE=file    → FileAdapter   (JSON + lockfile, default)
 *   LOCATOR_STORE=sqlite  → SQLiteAdapter (ACID SQLite, no lockfile)
 *
 * @example
 * ```typescript
 * const manager = LocatorManager.getInstance();
 * const selector = manager.getLocator('home.searchButton');
 * await manager.updateLocator('home.searchButton', '#new-search-btn');
 * ```
 */
export class LocatorManager {
    private static instance: LocatorManager;
    private readonly adapter: LocatorAdapter;

    private constructor() {
        this.adapter = createLocatorAdapter(config.locatorStore);
    }

    /**
     * Get the singleton instance of LocatorManager.
     *
     * The instance is created once and reused; the backing adapter is
     * determined by `config.locatorStore` at construction time.
     */
    public static getInstance(): LocatorManager {
        if (!LocatorManager.instance) {
            LocatorManager.instance = new LocatorManager();
        }
        return LocatorManager.instance;
    }

    /**
     * Get a locator by its dot-path key (e.g. `'home.searchButton'`).
     *
     * @param key - Dot-separated path to the locator
     * @returns The CSS selector string, or `null` when not found
     */
    public getLocator(key: string): string | null {
        try {
            return this.adapter.getLocator(key);
        } catch (error) {
            logger.error(`[LocatorManager] Error retrieving locator for key '${key}': ${String(error)}`);
            return null;
        }
    }

    /**
     * Persist a new or updated selector for the given key.
     *
     * Delegates to the active adapter which handles locking/transactions
     * appropriate for its backend.
     *
     * @param key - Dot-separated path to the locator
     * @param newSelector - New CSS selector value
     */
    public async updateLocator(key: string, newSelector: string): Promise<void> {
        try {
            await this.adapter.updateLocator(key, newSelector);
            logger.info(`[LocatorManager] Updated locator '${key}' to '${newSelector}'`);
        } catch (error) {
            console.error('[LocatorManager] updateLocator failed:', error);
            logger.error(`[LocatorManager] Failed to update locator '${key}': ${String(error)}`);
        }
    }

    /**
     * Return all stored key→selector pairs as a flat object.
     *
     * Useful for exporting/migrating between adapters.
     */
    public getAllLocators(): Record<string, string> {
        return this.adapter.getAllLocators();
    }
}
