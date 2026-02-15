import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from '@playwright/test';
import { GiganttiHomePage } from './GiganttiHomePage.js';
import { CategoryPage } from './CategoryPage.js';
import { ProductDetailPage } from './ProductDetailPage.js';
import { AutoHealer } from '../AutoHealer.js';
import { config } from '../config/index.js';

// Mock dependencies
vi.mock('../config/locators.json', () => ({
    default: {
        gigantti: {
            searchInput: '#search',
            searchButton: '[data-testid="search-button"]',
            navLink: 'nav a:has-text("{}")',
            productCard: '.product',
            productTitle: ['.title'],
            productPrice: ['.price']
        }
    }
}));

// Mock logger to avoid clutter
vi.mock('../utils/Logger.js', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }
}));

describe('Page Objects', () => {
    let mockPage: Partial<Page>;
    let mockAutoHealer: Partial<AutoHealer>;
    let mockLocator: any;

    beforeEach(() => {
        mockLocator = {
            fill: vi.fn(),
            click: vi.fn(),
            first: vi.fn().mockReturnThis(),
            isVisible: vi.fn().mockResolvedValue(true),
            waitFor: vi.fn(),
            focus: vi.fn().mockResolvedValue(undefined),
            clear: vi.fn().mockResolvedValue(undefined),
        };

        mockPage = {
            goto: vi.fn(),
            locator: vi.fn().mockReturnValue(mockLocator),
            getByRole: vi.fn().mockReturnValue(mockLocator),
            waitForLoadState: vi.fn(),
            waitForTimeout: vi.fn(),
            waitForResponse: vi.fn().mockResolvedValue(undefined as any),
            on: vi.fn(),
        };

        mockAutoHealer = {
            click: vi.fn(),
            fill: vi.fn(),
        };
    });

    describe('GiganttiHomePage', () => {
        let homePage: GiganttiHomePage;

        beforeEach(() => {
            homePage = new GiganttiHomePage(mockPage as Page, mockAutoHealer as AutoHealer);
            // Mock implicit site handler behavior from BasePage
            (homePage as any).siteHandler = { dismissOverlays: vi.fn().mockResolvedValue(undefined) };
        });

        it('should open and navigate', async () => {
            await homePage.open();
            expect(mockPage.goto).toHaveBeenCalled();
        });

        it('should search for a term', async () => {
            const term = config.testData.searchTerms[0] || 'laptop';
            await homePage.searchFor(term);
            // Should fill search input
            expect(mockPage.locator).toHaveBeenCalledWith('#search');
            // Should click search button
            expect(mockPage.locator).toHaveBeenCalledWith('[data-testid="search-button"]');
        });

        it('should navigate to category via link', async () => {
            const category = 'Gaming'; // Keeping hardcoded here as it needs to match mock expectations or config needs update
            await homePage.navigateToCategory(category);
            expect(mockPage.locator).toHaveBeenCalledWith(expect.stringContaining(category));
            expect(mockLocator.click).toHaveBeenCalled();
        });

        it('should fall back to getByRole if locator fails', async () => {
            const category = 'Gaming';
            // First locator fails isVisible check
            const failLocator = { ...mockLocator, isVisible: vi.fn().mockResolvedValue(false) };
            const successLocator = { ...mockLocator, isVisible: vi.fn().mockResolvedValue(true) };

            mockPage.locator = vi.fn().mockReturnValue(failLocator);
            mockPage.getByRole = vi.fn().mockReturnValue(successLocator);

            await homePage.navigateToCategory(category);

            expect(mockPage.getByRole).toHaveBeenCalledWith('link', expect.objectContaining({ name: new RegExp(category, 'i') }));
            expect(successLocator.click).toHaveBeenCalled();
        });
    });

    describe('CategoryPage', () => {
        let categoryPage: CategoryPage;

        beforeEach(() => {
            categoryPage = new CategoryPage(mockPage as Page, mockAutoHealer as AutoHealer);
            (categoryPage as any).siteHandler = { dismissOverlays: vi.fn().mockResolvedValue(undefined) };
        });

        it('should verify products displayed', async () => {
            await categoryPage.verifyProductsDisplayed();
            // Should wait for product card
            expect(mockPage.locator).toHaveBeenCalledWith('.product');
            expect(mockLocator.waitFor).toHaveBeenCalledWith(expect.objectContaining({ state: 'visible' }));
        });

        it('should click first product using AutoHealer', async () => {
            await categoryPage.clickFirstProduct();
            expect(mockAutoHealer.click).toHaveBeenCalledWith('gigantti.productCard', expect.any(Object));
        });
    });

    describe('ProductDetailPage', () => {
        let detailPage: ProductDetailPage;

        beforeEach(() => {
            detailPage = new ProductDetailPage(mockPage as Page, mockAutoHealer as AutoHealer);
            (detailPage as any).siteHandler = { dismissOverlays: vi.fn().mockResolvedValue(undefined) };
        });

        it('should verify product details loaded', async () => {
            await detailPage.verifyProductDetailsLoaded();
            // Check title
            expect(mockPage.locator).toHaveBeenCalledWith('.title');
            expect(mockLocator.waitFor).toHaveBeenCalled();
            // Check price
            expect(mockPage.locator).toHaveBeenCalledWith('.price');
        });

        it('should handle missing price gracefully', async () => {
            // Mock price waitFor to fail (second call)
            // First call (title) should succeed
            mockLocator.waitFor
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('Timeout'));

            await detailPage.verifyProductDetailsLoaded();

            // Should verify that logger.warn was called
            const { logger } = await import('../utils/Logger.js');
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Price element not immediately visible'));
        });
    });
});
