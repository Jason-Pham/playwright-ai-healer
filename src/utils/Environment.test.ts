import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { loadEnvironment, getEnvironment, isDev, isProd } from './Environment.js';

// Mock fs, path, and dotenv
vi.mock('fs');
vi.mock('path', async () => {
    const actual = await vi.importActual('path');
    return {
        ...actual,
        resolve: vi.fn(),
    };
});
vi.mock('dotenv', async () => {
    const actual = await vi.importActual<typeof import('dotenv')>('dotenv');
    return {
        default: {
            parse: actual.parse,
            config: vi.fn(),
        },
    };
});

describe('Environment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('isDev', () => {
        it('should return true when ENV is dev or undefined', () => {
            delete process.env['ENV'];
            expect(isDev()).toBe(true); // Default is dev

            process.env['ENV'] = 'dev';
            expect(isDev()).toBe(true);
        });

        it('should return false when ENV is prod', () => {
            process.env['ENV'] = 'prod';
            expect(isDev()).toBe(false);
        });
    });

    describe('isProd', () => {
        it('should return true when ENV is prod', () => {
            process.env['ENV'] = 'prod';
            expect(isProd()).toBe(true);
        });

        it('should return false when ENV is dev', () => {
            process.env['ENV'] = 'dev';
            expect(isProd()).toBe(false);
        });
    });

    describe('getEnvironment', () => {
        it('should return dev by default', () => {
            delete process.env['ENV'];
            expect(getEnvironment()).toBe('dev');
        });

        it('should return value of ENV', () => {
            process.env['ENV'] = 'staging';
            expect(getEnvironment()).toBe('staging');
        });
    });

    describe('loadEnvironment', () => {
        it('should set ENV from TEST_ENV if provided', () => {
            process.env['TEST_ENV'] = 'prod';
            vi.mocked(fs.existsSync).mockReturnValue(false); // No files

            loadEnvironment();
            expect(process.env['ENV']).toBe('prod');
        });

        it('should default to dev if no env vars set', () => {
            delete process.env['TEST_ENV'];
            delete process.env['ENV'];
            vi.mocked(fs.existsSync).mockReturnValue(false);

            const result = loadEnvironment();
            expect(result).toBe('dev');
        });

        it('should prefer .env values over env-specific file values', () => {
            process.env['TEST_ENV'] = 'staging';
            delete process.env['MY_TEST_VAR'];

            // Both .env.staging and .env exist
            vi.mocked(fs.existsSync).mockReturnValue(true);
            // env-specific file sets MY_TEST_VAR=staging-value
            vi.mocked(fs.readFileSync).mockReturnValue('MY_TEST_VAR=staging-value' as never);
            // base .env loading overrides with MY_TEST_VAR=local-value
            vi.mocked(dotenv.config).mockImplementation(() => {
                process.env['MY_TEST_VAR'] = 'local-value';
                return { parsed: { MY_TEST_VAR: 'local-value' } };
            });

            loadEnvironment();

            expect(process.env['MY_TEST_VAR']).toBe('local-value');
        });

        it('should not apply empty values from env-specific file', () => {
            process.env['TEST_ENV'] = 'staging';
            process.env['MY_TEST_VAR'] = 'existing-value';

            vi.mocked(fs.existsSync).mockReturnValue(true);
            // env-specific file has MY_TEST_VAR with an empty value
            vi.mocked(fs.readFileSync).mockReturnValue('MY_TEST_VAR=' as never);
            // base .env doesn't touch MY_TEST_VAR
            vi.mocked(dotenv.config).mockReturnValue({ parsed: {} });

            loadEnvironment();

            expect(process.env['MY_TEST_VAR']).toBe('existing-value');
        });
    });
});
