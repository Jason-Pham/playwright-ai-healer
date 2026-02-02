import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

export type Environment = 'dev' | 'staging' | 'prod';

/**
 * Load environment configuration.
 * Strategy: Load base .env first (for secrets), then override with env-specific values.
 * This allows env-specific files to only contain non-secret overrides.
 */
export function loadEnvironment(): Environment {
    // Determine which environment to load from TEST_ENV or ENV
    const env = (process.env['TEST_ENV'] || process.env['ENV'] || '') as Environment;

    // 1. First, load the base .env file for secrets (API keys, etc.)
    const basePath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(basePath)) {
        dotenv.config({ path: basePath, quiet: true } as any);
    }

    // 2. If env is specified, overlay the env-specific file (overrides non-secret config)
    if (env) {
        const envPath = path.resolve(process.cwd(), `.env.${env}`);
        if (fs.existsSync(envPath)) {
            // Only override if values are not empty
            const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));
            for (const [key, value] of Object.entries(envConfig)) {
                // Only override if value is not empty (allows base .env secrets to remain)
                if (value && value.trim() !== '') {
                    process.env[key] = value;
                }
            }
        }
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
