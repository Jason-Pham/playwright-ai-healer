import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealingEngine } from './HealingEngine.js';
import * as DOMSerializer from './DOMSerializer.js';
import type { AIClientManager, AICallResult } from './AIClientManager.js';
import type { Page } from '@playwright/test';

// Spy on the real (mocked at test-setup level) getSimplifiedDOM
const getSimplifiedDOMSpy = vi.spyOn(DOMSerializer, 'getSimplifiedDOM');

function makeMockPage(): Page {
    return {
        locator: vi.fn().mockReturnValue({
            count: vi.fn().mockResolvedValue(1),
        }),
    } as unknown as Page;
}

function makeMockClientManager(overrides: Partial<AIClientManager> = {}): AIClientManager {
    return {
        getProvider: vi.fn().mockReturnValue('gemini'),
        getModelName: vi.fn().mockReturnValue('gemini-flash'),
        getKeyCount: vi.fn().mockReturnValue(2),
        getCurrentKeyIndex: vi.fn().mockReturnValue(0),
        rotateKey: vi.fn().mockReturnValue(true),
        switchProvider: vi.fn().mockReturnValue(false),
        makeRequest: vi.fn(),
        ...overrides,
    } as unknown as AIClientManager;
}

describe('HealingEngine', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getSimplifiedDOMSpy.mockResolvedValue('<div id="target">button</div>');
    });

    describe('DOM snapshot caching', () => {
        it('should call getSimplifiedDOM exactly once per heal() even on successful first try', async () => {
            const client = makeMockClientManager({
                makeRequest: vi.fn().mockResolvedValueOnce({
                    raw: '#target',
                } as AICallResult),
            } as unknown as Partial<AIClientManager>);

            const engine = new HealingEngine(client);
            await engine.heal(makeMockPage(), '#broken', new Error('not found'));

            expect(getSimplifiedDOMSpy).toHaveBeenCalledTimes(1);
        });

        it('should call getSimplifiedDOM exactly once when retries occur (401 key rotation)', async () => {
            const error401 = new Error('Unauthorized');
            Object.assign(error401, { status: 401 });

            const client = makeMockClientManager({
                rotateKey: vi.fn().mockReturnValue(true),
                makeRequest: vi
                    .fn()
                    .mockRejectedValueOnce(error401)
                    .mockResolvedValueOnce({ raw: '#healed' } as AICallResult),
            } as unknown as Partial<AIClientManager>);

            const engine = new HealingEngine(client);
            await engine.heal(makeMockPage(), '#broken', new Error('not found'));

            // DOM snapshot captured once, reused across the retry
            expect(getSimplifiedDOMSpy).toHaveBeenCalledTimes(1);
            // But makeRequest was called twice (once failed, once succeeded)
            expect(client.makeRequest).toHaveBeenCalledTimes(2);
        });

        it('should call getSimplifiedDOM exactly once when 5xx retries occur', async () => {
            const error503 = new Error('Service Unavailable');
            Object.assign(error503, { status: 503 });

            const client = makeMockClientManager({
                makeRequest: vi
                    .fn()
                    .mockRejectedValueOnce(error503)
                    .mockResolvedValueOnce({ raw: '#healed-after-503' } as AICallResult),
            } as unknown as Partial<AIClientManager>);

            const engine = new HealingEngine(client);
            await engine.heal(makeMockPage(), '#broken', new Error('not found'));

            expect(getSimplifiedDOMSpy).toHaveBeenCalledTimes(1);
            expect(client.makeRequest).toHaveBeenCalledTimes(2);
        });
    });

    describe('healing events', () => {
        it('should record a healing event after heal()', async () => {
            const client = makeMockClientManager({
                makeRequest: vi.fn().mockResolvedValueOnce({
                    raw: '#fixed',
                    tokensUsed: { prompt: 100, completion: 50, total: 150 },
                } as AICallResult),
            } as unknown as Partial<AIClientManager>);

            const engine = new HealingEngine(client);
            const result = await engine.heal(makeMockPage(), '#broken', new Error('not found'));

            expect(result).not.toBeNull();
            expect(result!.selector).toBe('#fixed');

            const events = engine.getHealingEvents();
            expect(events).toHaveLength(1);
            expect(events[0]!.originalSelector).toBe('#broken');
            expect(events[0]!.success).toBe(true);
        });

        it('should record a failed event when AI returns FAIL', async () => {
            const client = makeMockClientManager({
                makeRequest: vi.fn().mockResolvedValueOnce({
                    raw: 'FAIL',
                } as AICallResult),
            } as unknown as Partial<AIClientManager>);

            const engine = new HealingEngine(client);
            const result = await engine.heal(makeMockPage(), '#broken', new Error('not found'));

            expect(result).toBeNull();
            const events = engine.getHealingEvents();
            expect(events).toHaveLength(1);
            expect(events[0]!.success).toBe(false);
        });
    });
});
