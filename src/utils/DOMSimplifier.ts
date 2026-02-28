import type { Page } from '@playwright/test';

/**
 * DOMSimplifier — Captures and sanitizes the page DOM for AI consumption.
 *
 * Extracted from AutoHealer to provide a focused, testable module for
 * DOM capture, noise removal, PII scrubbing, and attribute filtering.
 */
export class DOMSimplifier {
    /**
     * Captures a simplified version of the page DOM.
     *
     * - Removes script, style, SVG, and other noise tags
     * - Strips non-essential attributes (keeps id, class, role, etc.)
     * - Redacts input values to prevent credential leakage
     * - Scrubs PII (emails, phone numbers) from text nodes
     * - Truncates long text nodes
     *
     * @param page - Playwright page instance
     * @returns Simplified HTML string
     */
    static async capture(page: Page): Promise<string> {
        return await page.evaluate(() => {
            // Helper to scrub PII
            const scrubPII = (text: string): string => {
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const phoneRegex = /(\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g;
                return text.replace(emailRegex, '[EMAIL]').replace(phoneRegex, '[PHONE]');
            };

            // Allow-list for attributes to keep token count low
            const validAttrs = new Set([
                'id', 'name', 'class', 'type', 'placeholder',
                'aria-label', 'role', 'href', 'title', 'alt',
            ]);

            // Clone DOM and sanitize for structural integrity
            const clone = document.body.cloneNode(true) as HTMLElement;

            // 1. Remove noise
            const removeTags = ['script', 'style', 'svg', 'noscript', 'iframe', 'video', 'audio'];
            removeTags.forEach(tag => clone.querySelectorAll(tag).forEach(el => el.remove()));

            // 2. Walk and Clean
            const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const el = node as HTMLElement;

                    // Scrub Attributes
                    Array.from(el.attributes).forEach(attr => {
                        if (attr.name === 'value' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                            el.setAttribute(attr.name, '[REDACTED]');
                        } else if (!validAttrs.has(attr.name) && !attr.name.startsWith('data-test')) {
                            el.removeAttribute(attr.name);
                        }
                    });
                } else if (node.nodeType === Node.TEXT_NODE) {
                    if (node.nodeValue) {
                        node.nodeValue = scrubPII(node.nodeValue);
                        if (node.nodeValue.length > 200) {
                            node.nodeValue = node.nodeValue.substring(0, 200) + '...';
                        }
                    }
                }
            }

            return clone.innerHTML;
        });
    }
}
