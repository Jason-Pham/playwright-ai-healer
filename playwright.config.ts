import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load the appropriate .env file based on TEST_ENV
const testEnv = process.env['TEST_ENV'] || 'dev';
const envPath = path.resolve(`.env.${testEnv}`);

if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[Playwright] Loaded environment: ${testEnv}`);
} else {
    dotenv.config();
    console.log(`[Playwright] Using default .env (no .env.${testEnv} found)`);
}

export default defineConfig({
    testDir: './tests',
    timeout: parseInt(process.env['TEST_TIMEOUT'] || '120000', 10),
    retries: process.env['CI'] ? 2 : 0,
    workers: 4,
    fullyParallel: true,

    use: {
        headless: process.env['HEADLESS'] !== 'false',
        baseURL: process.env['BASE_URL'] || 'https://www.gigantti.fi/',
    },

    // Environment-specific projects
    projects: [
        {
            name: 'default',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'dev',
            use: {
                ...devices['Desktop Chrome'],
                headless: false, // Dev runs with visible browser
            },
        },
        {
            name: 'staging',
            use: {
                ...devices['Desktop Chrome'],
                headless: true,
            },
        },
        {
            name: 'prod',
            use: {
                ...devices['Desktop Chrome'],
                headless: true,
            },
        },
        // Cross-browser testing (optional)
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
    ],
});
