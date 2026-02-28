import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';
import { logger } from '../utils/Logger.js';
import type { AIProvider } from '../types.js';

/**
 * AIClient — Abstraction over AI providers (Gemini / OpenAI).
 *
 * Encapsulates client initialization and query execution.
 * Extracted from AutoHealer for single-responsibility and testability.
 */
export interface IAIClient {
    /** Send a prompt to the AI and return the raw text response */
    query(prompt: string, timeoutMs: number): Promise<string>;
    /** Get the current provider name */
    readonly provider: AIProvider;
}

/**
 * Google Gemini AI client
 */
export class GeminiClient implements IAIClient {
    readonly provider: AIProvider = 'gemini';
    private client: GoogleGenerativeAI;
    private modelName: string;

    constructor(apiKey: string, modelName?: string) {
        this.client = new GoogleGenerativeAI(apiKey);
        this.modelName = modelName ?? config.ai.gemini.modelName;
    }

    async query(prompt: string, timeoutMs: number): Promise<string> {
        logger.info(`[GeminiClient] Sending request (model: ${this.modelName})...`);
        const model = this.client.getGenerativeModel({ model: this.modelName });

        const resultResult = await withTimeout(
            model.generateContent(prompt),
            timeoutMs,
            'Gemini'
        );

        const result = resultResult.response.text().trim();
        logger.info(`[GeminiClient] Response received: "${result}"`);
        return result;
    }

    /** Re-initialize with a new API key (for key rotation) */
    reinitialize(apiKey: string): void {
        this.client = new GoogleGenerativeAI(apiKey);
    }
}

/**
 * OpenAI client
 */
export class OpenAIClient implements IAIClient {
    readonly provider: AIProvider = 'openai';
    private client: OpenAI;
    private modelName: string;

    constructor(apiKey: string, modelName?: string) {
        this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        this.modelName = modelName ?? config.ai.openai.modelName;
    }

    async query(prompt: string, timeoutMs: number): Promise<string> {
        logger.info(`[OpenAIClient] Sending request (model: ${this.modelName})...`);

        const completion = await withTimeout(
            this.client.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: this.modelName,
            }),
            timeoutMs,
            'OpenAI'
        );

        const result = completion.choices[0]?.message.content?.trim() ?? '';
        logger.info(`[OpenAIClient] Response received: "${result}"`);
        return result;
    }

    /** Re-initialize with a new API key (for key rotation) */
    reinitialize(apiKey: string): void {
        this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    }
}

/**
 * Factory to create the appropriate AI client
 */
export function createAIClient(provider: AIProvider, apiKey: string, modelName?: string): IAIClient & { reinitialize(apiKey: string): void } {
    if (provider === 'openai') {
        return new OpenAIClient(apiKey, modelName);
    }
    return new GeminiClient(apiKey, modelName);
}

/**
 * Wraps a promise with a timeout to prevent hanging API calls
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`[AIClient] ${label} API request timed out after ${ms / 1000}s`));
        }, ms);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId!);
    }
}
