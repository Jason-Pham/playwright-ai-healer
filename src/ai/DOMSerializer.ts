import type { Page } from '@playwright/test';

/**
 * Captures a minimal DOM snapshot focused on interactive/actionable elements.
 * Ancestors get minimal structural info (tag + id only).
 * Interactive elements get full attributes + text.
 * Output is hard-capped at 15,000 characters.
 *
 * @param page - Playwright page instance
 * @returns Simplified HTML string suitable for AI selector healing
 */
export async function getSimplifiedDOM(page: Page): Promise<string> {
    return await page.evaluate(() => {
        const MAX_OUTPUT_CHARS = 15000;

        const scrubPII = (text: string): string => {
            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const phoneRegex = /(\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g;
            return text.replace(emailRegex, '[EMAIL]').replace(phoneRegex, '[PHONE]');
        };

        const SKIP_TAGS = new Set([
            'script',
            'style',
            'svg',
            'path',
            'link',
            'meta',
            'noscript',
            'iframe',
            'video',
            'audio',
        ]);

        const FULL_ATTRS = new Set([
            'id',
            'name',
            'class',
            'type',
            'placeholder',
            'aria-label',
            'role',
            'href',
            'title',
            'alt',
            'for',
            'action',
        ]);

        // Only id and name for ancestor (structural) elements
        const STRUCTURAL_ATTRS = new Set(['id', 'name', 'role']);

        // Selectors for interactive elements
        const INTERACTIVE_SELECTOR = [
            'input',
            'button',
            'select',
            'textarea',
            'form',
            '[role="button"]',
            '[role="textbox"]',
            '[role="searchbox"]',
            '[role="combobox"]',
            '[role="checkbox"]',
            '[role="radio"]',
            '[onclick]',
            '[data-testid]',
            '[data-test]',
            '[data-cy]',
        ].join(',');

        // ── Step 1: Find interactive elements and mark ancestor chains ──
        const interactiveSet = new Set<Element>();
        const neededElements = new Set<Element>();

        const interactiveEls = document.body.querySelectorAll(INTERACTIVE_SELECTOR);
        interactiveEls.forEach(el => {
            // Skip elements hidden by CSS (e.g. dismissed cookie banners still in the DOM)
            if (
                typeof (el as HTMLElement).checkVisibility === 'function' &&
                !(el as HTMLElement).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
            )
                return;

            interactiveSet.add(el);
            let current: Element | null = el;
            while (current && current !== document.body) {
                if (neededElements.has(current)) break;
                neededElements.add(current);
                current = current.parentElement;
            }
        });
        neededElements.add(document.body);

        // ── Step 2: Serialize with role-based attribute filtering ──
        const serializeAttrs = (el: Element, isInteractive: boolean): string => {
            const tagName = el.tagName.toLowerCase();
            const allowedAttrs = isInteractive ? FULL_ATTRS : STRUCTURAL_ATTRS;
            let attrs = '';
            Array.from(el.attributes).forEach(attr => {
                const isDataTest = attr.name.startsWith('data-test') || attr.name.startsWith('data-cy');
                if (allowedAttrs.has(attr.name) || (isInteractive && isDataTest)) {
                    let value = attr.value;
                    if (attr.name === 'value' && (tagName === 'input' || tagName === 'textarea')) {
                        value = '[REDACTED]';
                    }
                    if (attr.name === 'class' && value.length > 60) {
                        value = value.substring(0, 60) + '...';
                    }
                    attrs += ` ${attr.name}="${value}"`;
                }
            });
            return attrs;
        };

        let charCount = 0;
        let budgetExceeded = false;

        const serializeNode = (node: Element, depth: number): string => {
            if (budgetExceeded) return '';
            const tagName = node.tagName.toLowerCase();
            if (SKIP_TAGS.has(tagName)) return '';

            const isInteractive = interactiveSet.has(node);
            const indent = '  '.repeat(Math.min(depth, 4));
            let html = `${indent}<${tagName}${serializeAttrs(node, isInteractive)}>`;

            // Only include text for interactive elements (not ancestors)
            if (isInteractive) {
                const directText: string[] = [];
                node.childNodes.forEach(child => {
                    if (child.nodeType === Node.TEXT_NODE) {
                        const text = child.nodeValue?.trim();
                        if (text) {
                            const scrubbed = scrubPII(text);
                            directText.push(scrubbed.length > 80 ? scrubbed.substring(0, 80) + '...' : scrubbed);
                        }
                    }
                });
                if (directText.length > 0) {
                    html += directText.join(' ');
                }
            }

            // Collect needed children
            const neededChildren: Element[] = [];
            Array.from(node.children).forEach(child => {
                if (neededElements.has(child)) neededChildren.push(child);
            });

            if (neededChildren.length > 0) {
                html += '\n';
                let i = 0;
                while (i < neededChildren.length && !budgetExceeded) {
                    const child = neededChildren[i]!;
                    const childTag = child.tagName.toLowerCase();
                    const childClass = child.getAttribute('class') || '';
                    const sig = `${childTag}|${childClass}`;

                    // Count consecutive similar siblings
                    let run = 1;
                    while (
                        i + run < neededChildren.length &&
                        `${neededChildren[i + run]!.tagName.toLowerCase()}|${neededChildren[i + run]!.getAttribute('class') || ''}` ===
                            sig
                    ) {
                        run++;
                    }

                    if (run >= 3) {
                        html += serializeNode(child, depth + 1) + '\n';
                        html += serializeNode(neededChildren[i + 1]!, depth + 1) + '\n';
                        html += `${'  '.repeat(Math.min(depth + 1, 4))}<!-- ...${run - 2} more <${childTag}> -->\n`;
                        i += run;
                    } else {
                        html += serializeNode(child, depth + 1) + '\n';
                        i++;
                    }
                }
                html += `${indent}</${tagName}>`;
            } else {
                html += `</${tagName}>`;
            }

            charCount += html.length;
            if (charCount > MAX_OUTPUT_CHARS) {
                budgetExceeded = true;
            }

            return html;
        };

        // ── Step 3: Serialize and enforce budget ──
        let result = serializeNode(document.body, 0);

        // Hard-cap the output
        if (result.length > MAX_OUTPUT_CHARS) {
            result = result.substring(0, MAX_OUTPUT_CHARS) + '\n<!-- DOM truncated at budget limit -->';
        }

        // ── Step 4: Fallback if no interactive elements found ──
        if (interactiveEls.length === 0) {
            const clone = document.body.cloneNode(true) as HTMLElement;
            ['script', 'style', 'svg', 'noscript', 'iframe', 'video', 'audio'].forEach(tag =>
                clone.querySelectorAll(tag).forEach(el => el.remove())
            );
            const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const n = walker.currentNode;
                if (n.nodeType === Node.ELEMENT_NODE) {
                    const el = n as HTMLElement;
                    Array.from(el.attributes).forEach(attr => {
                        if (attr.name === 'value' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                            el.setAttribute(attr.name, '[REDACTED]');
                        } else if (!FULL_ATTRS.has(attr.name) && !attr.name.startsWith('data-test')) {
                            el.removeAttribute(attr.name);
                        }
                    });
                } else if (n.nodeType === Node.TEXT_NODE && n.nodeValue) {
                    n.nodeValue = scrubPII(n.nodeValue);
                    if (n.nodeValue.length > 100) n.nodeValue = n.nodeValue.substring(0, 100) + '...';
                }
            }
            return clone.innerHTML.substring(0, MAX_OUTPUT_CHARS);
        }

        return result;
    });
}
