import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock loadEnvironment to prevent actual file I/O during tests
vi.mock('../utils/Environment.js', () => ({
    loadEnvironment: vi.fn(),
}));

describe('Config Validation (Zod Schema)', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.resetModules();
        // Start with minimum viable env
        process.env = {
            ...originalEnv,
            GEMINI_API_KEY: 'test-key',
            AI_PROVIDER: 'gemini',
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should load config successfully with valid Gemini env', async () => {
        const { config } = await import('./index.js');

        expect(config.ai.provider).toBe('gemini');
        expect(config.ai.gemini.apiKey).toBe('test-key');
    });

    it('should throw when AI_PROVIDER=gemini but GEMINI_API_KEY is missing', async () => {
        process.env['AI_PROVIDER'] = 'gemini';
        delete process.env['GEMINI_API_KEY'];

        await expect(import('./index.js')).rejects.toThrow('GEMINI_API_KEY is required');
    });

    it('should throw when AI_PROVIDER=openai but no OpenAI keys are set', async () => {
        process.env['AI_PROVIDER'] = 'openai';
        delete process.env['GEMINI_API_KEY'];
        delete process.env['OPENAI_API_KEY'];
        delete process.env['OPENAI_API_KEYS'];

        await expect(import('./index.js')).rejects.toThrow(
            'OPENAI_API_KEY or OPENAI_API_KEYS is required'
        );
    });

    it('should accept AI_PROVIDER=openai with OPENAI_API_KEY', async () => {
        process.env['AI_PROVIDER'] = 'openai';
        process.env['OPENAI_API_KEY'] = 'sk-test';
        delete process.env['GEMINI_API_KEY'];

        const { config } = await import('./index.js');
        expect(config.ai.provider).toBe('openai');
    });

    it('should accept AI_PROVIDER=openai with OPENAI_API_KEYS', async () => {
        process.env['AI_PROVIDER'] = 'openai';
        process.env['OPENAI_API_KEYS'] = 'key1,key2';
        delete process.env['GEMINI_API_KEY'];

        const { config } = await import('./index.js');
        expect(config.ai.openai.apiKeys).toEqual(['key1', 'key2']);
    });

    it('should default BASE_URL when not set', async () => {
        delete process.env['BASE_URL'];

        const { config } = await import('./index.js');
        expect(config.app.baseUrl).toBe('https://www.gigantti.fi/');
    });

    it('should default BASE_URL when set to empty or slash', async () => {
        process.env['BASE_URL'] = '/';

        const { config } = await import('./index.js');
        expect(config.app.baseUrl).toBe('https://www.gigantti.fi/');
    });

    it('should transform HEADLESS string to boolean', async () => {
        process.env['HEADLESS'] = 'false';
        const { config: config1 } = await import('./index.js');
        expect(config1.test.headless).toBe(false);
    });

    it('should transform HEADLESS=true to boolean true', async () => {
        process.env['HEADLESS'] = 'true';
        const { config } = await import('./index.js');
        expect(config.test.headless).toBe(true);
    });

    it('should transform TEST_TIMEOUT string to number', async () => {
        process.env['TEST_TIMEOUT'] = '90000';

        const { config } = await import('./index.js');
        expect(config.test.timeout).toBe(90000);
    });

    it('should default ENV to dev', async () => {
        delete process.env['ENV'];

        const { config } = await import('./index.js');
        expect(config.env).toBe('dev');
    });

    it('should default AI_PROVIDER to gemini', async () => {
        delete process.env['AI_PROVIDER'];

        const { config } = await import('./index.js');
        expect(config.ai.provider).toBe('gemini');
    });

    it('should default LOG_LEVEL and CONSOLE_LOG_LEVEL to info', async () => {
        delete process.env['LOG_LEVEL'];
        delete process.env['CONSOLE_LOG_LEVEL'];

        const { config } = await import('./index.js');
        expect(config.logging.level).toBe('info');
        expect(config.logging.consoleLevel).toBe('info');
    });
});
