import type { Page } from '@playwright/test';
import { AutoHealer } from '../AutoHealer.js';

export abstract class BasePage {
    protected page: Page;
    protected autoHealer: AutoHealer;

    constructor(page: Page, autoHealer: AutoHealer) {
        this.page = page;
        this.autoHealer = autoHealer;
    }

    async goto(url: string) {
        await this.page.goto(url);
    }

    async wait(ms: number) {
        await this.page.waitForTimeout(ms);
    }
}
