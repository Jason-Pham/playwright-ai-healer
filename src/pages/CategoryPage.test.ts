import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page, Locator } from '@playwright/test';
import { CategoryPage } from './CategoryPage.js';
import { AutoHealer } from '../AutoHealer.js';

describe('CategoryPage', () => {
    let mockPage: Page;
    let mockAutoHealer: AutoHealer;
    let categoryPage: CategoryPage;
    let mockLocator: Locator;

    beforeEach(() => {
        mockLocator = {
            first: vi.fn().mockReturnThis(),
            click: vi.fn().mockResolvedValue(undefined),
            isVisible: vi.fn().mockResolvedValue(true),
            waitFor: vi.fn().mockResolvedValue(undefined),
        } as unknown as Locator;

        mockPage = {
            locator: vi.fn().mockReturnValue(mockLocator),
            waitForLoadState: vi.fn().mockResolvedValue(undefined),
            waitForTimeout: vi.fn().mockResolvedValue(undefined),
        } as unknown as Page;

        mockAutoHealer = {
            click: vi.fn().mockResolvedValue(undefined),
        } as unknown as AutoHealer;

        categoryPage = new CategoryPage(mockPage, mockAutoHealer);
    });

    describe('verifyProductsDisplayed()', () => {
        it('should verify products are displayed on the page', async () => {
            await categoryPage.verifyProductsDisplayed();

            expect(mockPage.waitForLoadState).toHaveBeenCalled();
            expect(mockLocator.waitFor).toHaveBeenCalled();
        });

        it('should wait for products with correct timeout', async () => {
            await categoryPage.verifyProductsDisplayed();

            expect(mockPage.waitForLoadState).toHaveBeenCalled();
            expect(mockLocator.waitFor).toHaveBeenCalledWith({
                state: 'visible',
                timeout: expect.any(Number),
            });
        });
    });

    describe('clickFirstProduct()', () => {
        it('should click on first product and return ProductDetailPage', async () => {
            const result = await categoryPage.clickFirstProduct();

            expect(mockPage.locator).toHaveBeenCalledWith('[data-testid="product-card"]');
            expect(mockLocator.first).toHaveBeenCalled();
            expect(mockLocator.click).toHaveBeenCalledWith({ force: true });
            expect(result).toBeDefined();
        });

        it('should wait for navigation after clicking product', async () => {
            await categoryPage.clickFirstProduct();

            expect(mockPage.waitForLoadState).toHaveBeenCalled();
        });
    });
});
