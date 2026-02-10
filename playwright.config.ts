import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load the appropriate .env file based on TEST_ENV
const testEnv = process.env['TEST_ENV'] || 'dev';
const envPath = path.resolve(`.env.${testEnv}`);

if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true }); // override: true replaces quiet: true which is deprecated/removed in newer dotenv types
} else {
    dotenv.config({ override: true });
}

export default defineConfig({
    testDir: './tests',
    timeout: parseInt(process.env['TEST_TIMEOUT'] || '120000', 10),
    retries: process.env['CI'] ? 2 : 0,
    workers: 4,
    fullyParallel: true,

    // Generate HTML report for CI artifacts
    reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

    use: {
        headless: process.env['HEADLESS'] !== 'false',
        baseURL: process.env['BASE_URL'] || 'https://www.gigantti.fi/',
        screenshot: 'on-first-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
    },

    // Environment-specific projects
    projects: [
        // Environment projects (Chromium-based)
        {
            name: 'default',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'dev',
            use: {
                ...devices['Desktop Chrome'],
                headless: false,
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

        // Desktop browsers - All major engines
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'chrome',
            use: {
                ...devices['Desktop Chrome'],
                channel: 'chrome', // Uses actual Google Chrome
            },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: {
                ...devices['Desktop Safari'],
                launchOptions: {
                    slowMo: 100,
                },
            },
        },
        {
            name: 'edge',
            use: {
                ...devices['Desktop Edge'],
                channel: 'msedge', // Uses actual Microsoft Edge
            },
        },

        // Mobile devices
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 5'] },
        },
        {
            name: 'mobile-safari',
            use: { ...devices['iPhone 12'] },
        },
        {
            name: 'tablet',
            use: { ...devices['iPad (gen 7)'] },
        },
    ],
});
