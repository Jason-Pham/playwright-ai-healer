
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
    testDir: './tests',
    timeout: 120000,
    retries: 0,
    workers: 4,           // Run tests with 4 parallel workers
    fullyParallel: true,  // Run ALL tests in parallel (even within same file)
    use: {
        headless: true,
    },
});
