import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';

// Mock fs module before importing LocatorManager
vi.mock('fs');
vi.mock('proper-lockfile', () => ({
    lock: vi.fn().mockResolvedValue(() => Promise.resolve()), // Return release function
}));

// We need to reset modules to get a fresh singleton each time
const getLocatorManager = async () => {
    // Clear module cache and get fresh instance
    vi.resetModules();
    const { LocatorManager } = await import('./LocatorManager.js');
    return LocatorManager;
};

describe('LocatorManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Singleton Pattern', () => {
        it('should return the same instance on multiple calls', async () => {
            const mockLocators = { page: { button: '#submit' } };
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockLocators));

            const LocatorManager = await getLocatorManager();
            const instance1 = LocatorManager.getInstance();
            const instance2 = LocatorManager.getInstance();

            expect(instance1).toBe(instance2);
        });
    });

    describe('getLocator', () => {
        it('should return selector for valid simple key', async () => {
            const mockLocators = { button: '#submit-btn' };
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockLocators));

            const LocatorManager = await getLocatorManager();
            const manager = LocatorManager.getInstance();

            expect(manager.getLocator('button')).toBe('#submit-btn');
        });

        it('should return selector for valid nested key', async () => {
            const mockLocators = { gigantti: { searchInput: '#search-box' } };
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockLocators));

            const LocatorManager = await getLocatorManager();
            const manager = LocatorManager.getInstance();

            expect(manager.getLocator('gigantti.searchInput')).toBe('#search-box');
        });

        it('should return null for non-existent key', async () => {
            const mockLocators = { page: { button: '#submit' } };
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockLocators));

            const LocatorManager = await getLocatorManager();
            const manager = LocatorManager.getInstance();

            expect(manager.getLocator('nonexistent.key')).toBeNull();
        });

        it('should return null for non-string value', async () => {
            const mockLocators = { page: { nested: { deep: 'value' } } };
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockLocators));

            const LocatorManager = await getLocatorManager();
            const manager = LocatorManager.getInstance();

            // 'page.nested' returns an object, not a string
            expect(manager.getLocator('page.nested')).toBeNull();
        });
    });

    describe('updateLocator', () => {
        it('should update locator and save to file', async () => {
            const mockLocators = { gigantti: { searchInput: '#old-selector' } };
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockLocators));
            vi.mocked(fs.writeFileSync).mockImplementation(() => { });

            const LocatorManager = await getLocatorManager();
            const manager = LocatorManager.getInstance();

            await manager.updateLocator('gigantti.searchInput', '#new-selector');

            expect(fs.writeFileSync).toHaveBeenCalled();
            // Verify the new value is accessible
            expect(manager.getLocator('gigantti.searchInput')).toBe('#new-selector');
        });

        it('should create nested path if it does not exist', async () => {
            const mockLocators = {};
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockLocators));
            vi.mocked(fs.writeFileSync).mockImplementation(() => { });

            const LocatorManager = await getLocatorManager();
            const manager = LocatorManager.getInstance();

            await manager.updateLocator('new.nested.path', '#new-selector');

            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('File Handling', () => {
        it('should handle missing locators file gracefully', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            const LocatorManager = await getLocatorManager();
            const manager = LocatorManager.getInstance();

            expect(manager.getLocator('any.key')).toBeNull();
            consoleSpy.mockRestore();
        });

        it('should handle invalid JSON gracefully', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }');
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            const LocatorManager = await getLocatorManager();
            const manager = LocatorManager.getInstance();

            expect(manager.getLocator('any.key')).toBeNull();
            consoleSpy.mockRestore();
        });
    });
});
