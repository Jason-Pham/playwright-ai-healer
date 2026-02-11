import winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { type TestInfo } from '@playwright/test';

// Get current directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const logsDir = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output with colors and timestamps
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] ${level}: ${message}`;
    })
);

// Custom format for file output (no colors, JSON-friendly)
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
    })
);

// Create the winston logger instance
const winstonLogger = winston.createLogger({
    level: process.env['LOG_LEVEL'] || 'info',
    transports: [
        // Console transport for local development
        new winston.transports.Console({
            format: consoleFormat,
            level: process.env['CONSOLE_LOG_LEVEL'] || 'info',
        }),
        // File transport for persistent logs
        new winston.transports.File({
            filename: path.join(logsDir, 'execution.log'),
            format: fileFormat,
            maxsize: 5 * 1024 * 1024, // 5MB max file size
            maxFiles: 3, // Keep up to 3 rotated log files
        }),
    ],
});

/**
 * Enterprise-grade Logger utility.
 * Wraps Winston and provides Playwright integration.
 */
export class Logger {
    private static instance: Logger;
    private playwrightTestInfo: TestInfo | null = null;

    private constructor() {}

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Attach a Playwright test.info() object to enable report integration.
     * Call this at the start of a test: Logger.getInstance().setTestInfo(test.info());
     */
    public setTestInfo(testInfo: TestInfo): void {
        this.playwrightTestInfo = testInfo;
    }

    /**
     * Clear the test info (call at the end of a test or in afterEach).
     */
    public clearTestInfo(): void {
        this.playwrightTestInfo = null;
    }

    private log(level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
        winstonLogger.log(level, message);

        // Optionally attach to Playwright test report
        if (this.playwrightTestInfo) {
            try {
                this.playwrightTestInfo.annotations.push({
                    type: level,
                    description: message,
                });
            } catch {
                // Ignore if test context is not active
            }
        }
    }

    public info(message: string): void {
        this.log('info', message);
    }

    public warn(message: string): void {
        this.log('warn', message);
    }

    public error(message: string): void {
        this.log('error', message);
    }

    public debug(message: string): void {
        this.log('debug', message);
    }
}

// Export a singleton instance for convenience
export const logger = Logger.getInstance();
