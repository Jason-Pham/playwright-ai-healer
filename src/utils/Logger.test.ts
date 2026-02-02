
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from './Logger.js';
import winston from 'winston';

// Mock Winston
vi.mock('winston', () => {
    const mockLogger = {
        log: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
    };
    return {
        default: {
            createLogger: vi.fn(() => mockLogger),
            transports: {
                Console: vi.fn(),
                File: vi.fn(),
            },
            format: {
                combine: vi.fn(),
                timestamp: vi.fn(),
                colorize: vi.fn(),
                printf: vi.fn(),
            },
        },
    };
});

describe('Logger', () => {
    let loggerInstance: Logger;

    beforeEach(() => {
        vi.clearAllMocks();
        // Access private instance via static method since it's a singleton
        loggerInstance = Logger.getInstance();
    });

    it('should be a singleton', () => {
        const instance1 = Logger.getInstance();
        const instance2 = Logger.getInstance();
        expect(instance1).toBe(instance2);
    });

    it('should log info messages', () => {
        const winstonSpy = vi.spyOn(winston.createLogger(), 'log');
        loggerInstance.info('test info');
        expect(winstonSpy).toHaveBeenCalled();
        expect(winstonSpy).toHaveBeenCalledWith('info', 'test info');
    });

    it('should log error messages', () => {
        const winstonSpy = vi.spyOn(winston.createLogger(), 'log');
        loggerInstance.error('test error');
        expect(winstonSpy).toHaveBeenCalledWith('error', 'test error');
    });

    describe('Test Info Integration', () => {
        it('should attach annotations to test info if present', () => {
            const mockTestInfo: any = {
                annotations: []
            };

            loggerInstance.setTestInfo(mockTestInfo);
            loggerInstance.warn('test warning');

            expect(mockTestInfo.annotations).toHaveLength(1);
            expect(mockTestInfo.annotations[0]).toEqual({
                type: 'warn',
                description: 'test warning'
            });

            // Cleanup
            loggerInstance.clearTestInfo();
        });

        it('should NOT attach annotations if test info is cleared', () => {
            const mockTestInfo: any = {
                annotations: []
            };

            loggerInstance.setTestInfo(mockTestInfo);
            loggerInstance.clearTestInfo();
            loggerInstance.info('test info');

            expect(mockTestInfo.annotations).toHaveLength(0);
        });
    });
});
