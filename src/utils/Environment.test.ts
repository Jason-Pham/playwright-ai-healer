import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { loadEnvironment, getEnvironment, isDev, isProd } from './Environment.js';

// Mock fs and path
vi.mock('fs');
vi.mock('path', async () => {
    const actual = await vi.importActual('path');
    return {
        ...actual,
        resolve: vi.fn(),
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
            (fs.existsSync as any).mockReturnValue(false); // No files

            loadEnvironment();
            expect(process.env['ENV']).toBe('prod');
        });

        it('should default to dev if no env vars set', () => {
            delete process.env['TEST_ENV'];
            delete process.env['ENV'];
            (fs.existsSync as any).mockReturnValue(false);

            const result = loadEnvironment();
            expect(result).toBe('dev');
        });
    });
});
