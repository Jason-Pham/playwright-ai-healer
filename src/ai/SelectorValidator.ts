import { logger } from '../utils/Logger.js';

/**
 * Validates that an AI-returned selector is safe to use.
 *
 * Rejects injection payloads and selectors that don't match known-safe patterns.
 * Accepts standard CSS selectors, XPath expressions, Playwright text-engine
 * prefixes (`text=`, `role=`, etc.), and attribute selectors.
 *
 * @param selector - The selector string returned by the AI provider
 * @returns `true` if the selector matches a known-safe pattern, `false` otherwise
 */
export function validateSelector(selector: string): boolean {
    if (!selector || selector.trim().length === 0) {
        return false;
    }

    const trimmed = selector.trim();

    // Denylist: dangerous prefixes (case-insensitive)
    const dangerousPrefixes = ['javascript:', 'data:'];
    for (const prefix of dangerousPrefixes) {
        if (trimmed.toLowerCase().startsWith(prefix)) {
            logger.warn(`[SelectorValidator] Rejected — dangerous prefix "${prefix}": "${trimmed}"`);
            return false;
        }
    }

    // Denylist: dangerous substrings that indicate HTML or JS injection.
    // Note: standalone `<` and `>` are NOT in the denylist because `>` is a valid
    // CSS child combinator and XPath uses `<`/`>` in comparisons.  We only block
    // patterns that unambiguously indicate injection payloads.
    const dangerousSubstrings = ['<script', '</', '<!--', 'eval(', 'document.', 'window.'];
    for (const pattern of dangerousSubstrings) {
        if (trimmed.toLowerCase().includes(pattern.toLowerCase())) {
            logger.warn(`[SelectorValidator] Rejected — dangerous pattern "${pattern}": "${trimmed}"`);
            return false;
        }
    }

    // Allowlist: Playwright text engine prefixes
    const playwrightPrefixes = [
        'text=',
        'role=',
        'label=',
        'placeholder=',
        'alt=',
        'title=',
        'testid=',
        'data-testid=',
    ];
    for (const prefix of playwrightPrefixes) {
        if (trimmed.toLowerCase().startsWith(prefix)) {
            return true;
        }
    }

    // Allowlist: XPath expressions
    if (trimmed.startsWith('//') || trimmed.startsWith('./')) {
        return true;
    }

    // Allowlist: CSS attribute selectors starting with `[`
    if (trimmed.startsWith('[')) {
        return true;
    }

    // Allowlist: Standard CSS selector characters only
    // Permits: alphanumeric, whitespace, and common CSS selector syntax tokens
    // (#id, .class, tag, [attr], :pseudo, >, +, ~, *, comma, quotes, =, ^, $, |, -, !, @, /)
    const safeCssPattern = /^[a-zA-Z0-9\s\-_#.:,[\]()="'^$*|>+~!@/\\]+$/;
    if (safeCssPattern.test(trimmed)) {
        return true;
    }

    // Default deny: selector did not match any known-safe pattern
    logger.warn(`[SelectorValidator] Rejected — selector does not match any safe pattern: "${trimmed}"`);
    return false;
}
