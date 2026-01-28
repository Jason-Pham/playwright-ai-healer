
import dotenv from 'dotenv';
dotenv.config();

export const config = {
    app: {
        baseUrl: process.env.BASE_URL || 'https://www.gigantti.fi/',
        selectors: {
            gigantti: {
                searchInput: '#speedy-header-search', // Intentionally broken
                realSearchInput: '#speedy-header-search',
                cookieBannerAccept: 'button.coi-banner__accept',
            }
        }
    },
    ai: {
        gemini: {
            apiKey: process.env.GEMINI_API_KEY,
            modelName: process.env.GEMINI_MODEL || 'gemini-flash-latest',
        },
        openai: {
            // Support single key or comma-separated list
            apiKeys: (process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean),
            modelName: process.env.OPENAI_MODEL || 'gpt-4o',
            apiKey: process.env.OPENAI_API_KEY, // Keep for backward compatibility/types
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
        timeouts: {
            click: 2000,
            fill: 2000,
            check: 5000,
            test: 30000,
            healing: 60000
        },
    },
    testData: {
        searchTerms: {
            default: 'samsung fold'
        }
    }
};
