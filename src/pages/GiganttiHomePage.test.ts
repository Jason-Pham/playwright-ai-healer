import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page, Locator } from '@playwright/test';
import { GiganttiHomePage } from './GiganttiHomePage.js';
import { AutoHealer } from '../AutoHealer.js';
import { CategoryPage } from './CategoryPage.js';

// Mock @playwright/test
vi.mock('@playwright/test', () => ({
    expect: vi.fn(actual => {
        if (typeof actual === 'function') {
            return {
                toPass: vi.fn(async () => {
                    await actual();
                }),
            };
        }
        return {
            toHaveValue: vi.fn(),
            toHaveURL: vi.fn(),
        };
    }),
    test: {
        info: vi.fn(() => ({
            project: { name: 'chromium' },
        })),
    },
}));

describe('GiganttiHomePage', () => {
    let mockPage: Page;
    let mockAutoHealer: AutoHealer;
    let homePage: GiganttiHomePage;
    let mockLocator: Locator;

    beforeEach(() => {
        mockLocator = {
            first: vi.fn().mockReturnThis(),
            isVisible: vi.fn().mockResolvedValue(true),
            click: vi.fn().mockResolvedValue(undefined),
            fill: vi.fn().mockResolvedValue(undefined),
            textContent: vi.fn().mockResolvedValue('test'),
            focus: vi.fn().mockResolvedValue(undefined),
            clear: vi.fn().mockResolvedValue(undefined),
        } as unknown as Locator;

        mockPage = {
            goto: vi.fn().mockResolvedValue(undefined),
            locator: vi.fn().mockReturnValue(mockLocator),
            getByRole: vi.fn().mockReturnValue(mockLocator),
            waitForLoadState: vi.fn().mockResolvedValue(undefined),
            waitForTimeout: vi.fn().mockResolvedValue(undefined),
            on: vi.fn(),
            url: vi.fn().mockReturnValue('https://www.gigantti.fi/'),
        } as unknown as Page;

        mockAutoHealer = {
            click: vi.fn().mockResolvedValue(undefined),
            fill: vi.fn().mockResolvedValue(undefined),
        } as unknown as AutoHealer;

        homePage = new GiganttiHomePage(mockPage, mockAutoHealer);
    });

    describe('open()', () => {
        it('should navigate to the base URL', async () => {
            await homePage.open();
            expect(mockPage.waitForLoadState).toHaveBeenCalled();
        });
    });

    describe('searchFor()', () => {
        it('should return CategoryPage instance', async () => {
            const searchTerm = 'laptop';
            const result = await homePage.searchFor(searchTerm);

            expect(result).toBeInstanceOf(CategoryPage);
        });
    });

    describe('navigateToCategory()', () => {
        it('should return CategoryPage instance when navigating to category', async () => {
            const categoryName = 'Tietotekniikka';
            mockLocator.isVisible = vi.fn().mockResolvedValue(true);

            const result = await homePage.navigateToCategory(categoryName);

            expect(result).toBeInstanceOf(CategoryPage);
        });
    });
});
