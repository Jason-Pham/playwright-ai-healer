import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page, Locator } from '@playwright/test';
import { ProductDetailPage } from './ProductDetailPage.js';
import { AutoHealer } from '../AutoHealer.js';

// Mock @playwright/test
vi.mock('@playwright/test', () => ({
    test: {
        info: vi.fn(() => ({
            project: { name: 'chromium' }
        }))
    }
}));

describe('ProductDetailPage', () => {
    let mockPage: Page;
    let mockAutoHealer: AutoHealer;
    let productPage: ProductDetailPage;
    let mockLocator: Locator;

    beforeEach(() => {
        mockLocator = {
            first: vi.fn().mockReturnThis(),
            waitFor: vi.fn().mockResolvedValue(undefined),
            textContent: vi.fn().mockResolvedValue('Sample Product'),
        } as unknown as Locator;

        mockPage = {
            locator: vi.fn().mockReturnValue(mockLocator),
            waitForLoadState: vi.fn().mockResolvedValue(undefined),
            waitForTimeout: vi.fn().mockResolvedValue(undefined),
        } as unknown as Page;

        mockAutoHealer = {
            click: vi.fn().mockResolvedValue(undefined),
        } as unknown as AutoHealer;

        productPage = new ProductDetailPage(mockPage, mockAutoHealer);
    });

    describe('verifyProductDetailsLoaded()', () => {
        it('should verify product title is visible', async () => {
            await productPage.verifyProductDetailsLoaded();

            expect(mockPage.locator).toHaveBeenCalled();
            expect(mockLocator.first).toHaveBeenCalled();
            expect(mockLocator.waitFor).toHaveBeenCalledWith({
                state: 'visible',
                timeout: expect.any(Number)
            });
        });

        it('should wait for page load state', async () => {
            await productPage.verifyProductDetailsLoaded();

            expect(mockPage.waitForLoadState).toHaveBeenCalled();
        });

        it('should handle price element not visible gracefully', async () => {
            mockLocator.waitFor = vi.fn()
                .mockResolvedValueOnce(undefined) // Title succeeds
                .mockRejectedValueOnce(new Error('Timeout')); // Price fails

            await expect(productPage.verifyProductDetailsLoaded()).resolves.not.toThrow();
        });
    });

    describe('getProductTitle()', () => {
        it('should return product title text', async () => {
            mockLocator.textContent = vi.fn().mockResolvedValue('Gaming Laptop');

            const title = await productPage.getProductTitle();

            expect(mockPage.locator).toHaveBeenCalledWith('h1');
            expect(title).toBe('Gaming Laptop');
        });

        it('should return empty string if title is null', async () => {
            mockLocator.textContent = vi.fn().mockResolvedValue(null);

            const title = await productPage.getProductTitle();

            expect(title).toBe('');
        });
    });

    describe('getProductPrice()', () => {
        it('should return product price text', async () => {
            mockLocator.textContent = vi.fn().mockResolvedValue('€999.00');

            const price = await productPage.getProductPrice();

            expect(mockPage.locator).toHaveBeenCalledWith(expect.stringContaining('price'));
            expect(price).toBe('€999.00');
        });

        it('should return empty string if price is null', async () => {
            mockLocator.textContent = vi.fn().mockResolvedValue(null);

            const price = await productPage.getProductPrice();

            expect(price).toBe('');
        });
    });
});
