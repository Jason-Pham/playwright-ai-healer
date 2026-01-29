
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './Logger.js';

// Get current directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LocatorManager {
    private static instance: LocatorManager;
    private locatorsPath: string;
    private locators: any;

    private constructor() {
        // Resolve path relative to this file (src/utils -> src/config/locators.json)
        this.locatorsPath = path.resolve(__dirname, '../config/locators.json');
        this.loadLocators();
    }

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
                this.locators = JSON.parse(fileContent);
            } else {
                this.locators = {};
                logger.warn(`[LocatorManager] Locators file not found at ${this.locatorsPath}`);
            }
        } catch (error) {
            logger.error(`[LocatorManager] Failed to load locators: ${error}`);
            this.locators = {};
        }
    }

    public getLocator(key: string): string | null {
        try {
            const parts = key.split('.');
            let current = this.locators;

            for (const part of parts) {
                if (current === undefined || current === null) return null;
                current = current[part];
            }

            return typeof current === 'string' ? current : null;
        } catch (error) {
            logger.error(`[LocatorManager] Error retrieving locator for key '${key}': ${error}`);
            return null;
        }
    }

    public updateLocator(key: string, newSelector: string) {
        try {
            const parts = key.split('.');
            let current = this.locators;

            // Traverse to the second to last part
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (part === undefined) continue;

                if (current === null || typeof current !== 'object') {
                    throw new Error(`Cannot traverse path segment '${part}'`);
                }
                if (!current[part]) {
                    current[part] = {};
                }
                current = current[part];
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
            logger.error(`[LocatorManager] Failed to update locator '${key}': ${error}`);
        }
    }

    private saveLocators() {
        try {
            fs.writeFileSync(this.locatorsPath, JSON.stringify(this.locators, null, 2), 'utf-8');
        } catch (error) {
            logger.error(`[LocatorManager] Failed to save locators: ${error}`);
        }
    }
}
