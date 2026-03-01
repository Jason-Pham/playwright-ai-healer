import { z } from 'zod';
import { loadEnvironment } from '../utils/Environment.js';

// Define the schema for environment variables
const envSchema = z.object({
    ENV: z.enum(['dev', 'staging', 'prod']).default('dev'),
    BASE_URL: z
        .string()
        .optional()
        .transform(val => {
            if (!val || val === '/' || val === '') return 'https://www.gigantti.fi/';
            return val;
        })
        .pipe(z.string().url()),
    AI_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-flash-latest'),
    OPENAI_API_KEYS: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default('gpt-4o'),
    TEST_TIMEOUT: z.string().default('120000').transform(Number),
    HEADLESS: z
        .string()
        .default('true')
        .transform(val => val !== 'false'),
    LOG_LEVEL: z.string().default('info'),
    CONSOLE_LOG_LEVEL: z.string().default('info'),
});

type AppConfig = {
    env: string;
    app: { baseUrl: string };
    ai: {
        provider: string;
        gemini: { apiKey: string | undefined; modelName: string };
        openai: { apiKeys: string[]; modelName: string; apiKey: string | undefined };
        healing: { maxRetries: number; retryDelay: number; confidenceThreshold: number };
        security: { vercelChallengePath: string };
        prompts: { healingPrompt: (selector: string, error: string, html: string) => string };
    };
    test: {
        timeout: number;
        headless: boolean;
        timeouts: {
            default: number;
            cookie: number;
            urlVerify: number;
            productVisibility: number;
            click: number;
            fill: number;
            short: number;
            stabilization: number;
        };
    };
    logging: { level: string; consoleLevel: string };
    testData: {
        searchTerms: string[];
        getRandomSearchTerm(): string;
        categories: { computers: string };
    };
};

function buildConfig(): AppConfig {
    // loadEnvironment() is idempotent — safe to call multiple times
    loadEnvironment();

    const env = envSchema.parse(process.env);

    // Validate that the selected provider has a key
    if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is required when AI_PROVIDER is gemini');
    }
    if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY && !env.OPENAI_API_KEYS) {
        throw new Error('OPENAI_API_KEY or OPENAI_API_KEYS is required when AI_PROVIDER is openai');
    }

    return {
        env: env.ENV,
        app: {
            baseUrl: env.BASE_URL,
        },
        ai: {
            provider: env.AI_PROVIDER,
            gemini: {
                apiKey: env.GEMINI_API_KEY,
                modelName: env.GEMINI_MODEL,
            },
            openai: {
                apiKeys: (env.OPENAI_API_KEYS || env.OPENAI_API_KEY || '')
                    .split(',')
                    .map(k => k.trim())
                    .filter(Boolean),
                modelName: env.OPENAI_MODEL,
                apiKey: env.OPENAI_API_KEY,
            },
            healing: {
                maxRetries: 3,
                retryDelay: 5000,
                confidenceThreshold: 0.7,
            },
            security: {
                vercelChallengePath: '.well-known/vercel/security/request-challenge',
            },
            prompts: {
                healingPrompt: (selector: string, error: string, html: string) => `
      You are a Test Automation AI. A Playwright test failed to find an element.

      Original Selector: "${selector}"
      Error: "${error}"

      Below is the current HTML of the page (simplified).
      Analyze it to find the MOST LIKELY new selector for the element the user intended to interact with.

      Return ONLY the new selector as a plain string. If you cannot find it, return "FAIL".

      HTML Snippet:
      ${html}
    `,
            },
        },
        test: {
            timeout: env.TEST_TIMEOUT,
            headless: env.HEADLESS,
            timeouts: {
                // Global unified timeouts
                default: 30000,
                cookie: 10000,
                urlVerify: 15000,
                productVisibility: 30000,
                // AutoHealer action timeouts
                click: 10000,
                fill: 10000,
                // Action timeouts
                short: 5000,
                stabilization: 200,
            },
        },
        logging: {
            level: env.LOG_LEVEL,
            consoleLevel: env.CONSOLE_LOG_LEVEL,
        },
        testData: {
            searchTerms: [
                'kannettava',
                'puhelin',
                'televisio',
                'kuulokkeet',
                'tabletti',
                'kamera',
                'peli',
                'kaiutin',
                'näppäimistö',
                'näyttö',
            ],
            // Helper to get random search term
            getRandomSearchTerm(): string {
                const terms = this.searchTerms;
                return terms[Math.floor(Math.random() * terms.length)] || 'laptop';
            },
            categories: {
                computers: 'Tietotekniikka',
            },
        },
    };
}

/** Lazily-initialized singleton — Zod parsing and env validation only run on first access. */
let _config: AppConfig | undefined;

export const config: AppConfig = new Proxy({} as AppConfig, {
    get(_target, key: string | symbol) {
        if (!_config) _config = buildConfig();
        return Reflect.get(_config, key);
    },
});

/** Reset the config singleton. Use only in tests to allow re-initialisation after env changes. */
export function resetConfigForTesting(): void {
    _config = undefined;
}
