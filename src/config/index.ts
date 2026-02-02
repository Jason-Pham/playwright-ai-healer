import { loadEnvironment } from '../utils/Environment.js';

// Load environment-specific config first
loadEnvironment();

export const config = {
    // Current environment
    env: process.env['ENV'] || 'dev',

    app: {
        baseUrl: process.env['BASE_URL'] || 'https://www.gigantti.fi/',
        selectors: {
            gigantti: {
                searchInput: '#speedy-header-search',
                realSearchInput: '#speedy-header-search',
                cookieBannerAccept: 'button.coi-banner__accept',
                categoryLink: '[data-test="main-navigation"] a[href*="/tietokoneet"]',
                productCard: '[data-test="product-card"]',
                productTitle: '[data-test="product-title"]',
                productPrice: '[data-test="product-price"]',
            }
        }
    },
    ai: {
        provider: (process.env['AI_PROVIDER'] || 'gemini') as 'gemini' | 'openai',
        gemini: {
            apiKey: process.env['GEMINI_API_KEY'],
            modelName: process.env['GEMINI_MODEL'] || 'gemini-flash-latest',
        },
        openai: {
            apiKeys: (process.env['OPENAI_API_KEYS'] || process.env['OPENAI_API_KEY'] || '').split(',').map(k => k.trim()).filter(Boolean),
            modelName: process.env['OPENAI_MODEL'] || 'gpt-4o',
            apiKey: process.env['OPENAI_API_KEY'],
        },
        healing: {
            maxRetries: 3,
            retryDelay: 5000,
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
    `
        }
    },
    test: {
        timeout: parseInt(process.env['TEST_TIMEOUT'] || '120000', 10),
        headless: process.env['HEADLESS'] !== 'false',
        timeouts: {
            // Global unified timeouts
            default: 5000,
            cookie: 10000,
            urlVerify: 15000,
            productVisibility: 30000,
        },
    },
    testData: {
        searchTerms: [
            'laptop',
            'smartphone',
            'television',
            'headphones',
            'tablet',
            'camera',
            'gaming',
            'speaker',
            'keyboard',
            'monitor'
        ],
        // Helper to get random search term
        getRandomSearchTerm(): string {
            const terms = this.searchTerms;
            return terms[Math.floor(Math.random() * terms.length)] || 'laptop';
        },
        categories: {
            computers: 'Tietotekniikka',
        }
    }
};
