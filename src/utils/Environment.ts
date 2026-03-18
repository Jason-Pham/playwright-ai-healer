import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

export type Environment = 'dev' | 'staging' | 'prod';

let _envLoaded = false;

/**
 * Load environment configuration (idempotent – safe to call multiple times).
 * Strategy: Load env-specific .env.{env} first (as defaults), then load base .env with override so
 * local values (API keys, secrets) always take precedence over env-specific settings.
 */
export function loadEnvironment(): Environment {
    if (_envLoaded) {
        return (process.env['ENV'] || 'dev') as Environment;
    }
    _envLoaded = true;

    // Determine which environment to load from TEST_ENV or ENV
    const env = (process.env['TEST_ENV'] || process.env['ENV'] || '') as Environment;

    // 1. First load the env-specific file (defaults for that environment)
    if (env) {
        const envPath = path.resolve(process.cwd(), `.env.${env}`);
        if (fs.existsSync(envPath)) {
            // Only override if values are not empty
            const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));
            for (const [key, value] of Object.entries(envConfig)) {
                // Only override if value is not empty
                if (value && value.trim() !== '') {
                    process.env[key] = value;
                }
            }
        }
    }

    // 2. Then load the base .env file for secrets and user overrides (API keys, etc.)
    // This ensures that local values in .env always take precedence over env-specific files.
    const basePath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(basePath)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dotenv.config({ path: basePath, override: true, quiet: true } as any);
    }

    // Set ENV so config can read it
    if (env) {
        process.env['ENV'] = env;
    }

    return (process.env['ENV'] || 'dev') as Environment;
}

/**
 * Get the current environment name.
 */
export function getEnvironment(): Environment {
    return (process.env['ENV'] || 'dev') as Environment;
}

/**
 * Check if running in development mode.
 */
export function isDev(): boolean {
    return getEnvironment() === 'dev';
}

/**
 * Check if running in production mode.
 */
export function isProd(): boolean {
    return getEnvironment() === 'prod';
}

/**
 * Reset the environment loaded flag. Use only in tests to allow re-loading env vars.
 */
export function resetEnvironmentForTesting(): void {
    _envLoaded = false;
}
