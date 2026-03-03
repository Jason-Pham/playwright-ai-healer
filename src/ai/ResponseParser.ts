/**
 * Parses and cleans the raw AI response text.
 *
 * Handles common formatting artifacts that AI models add to their responses:
 * - Markdown code fences (``` ... ```)
 * - Inline backtick wrapping (`selector`)
 * - Surrounding single or double quotes
 *
 * @param raw - Raw string returned by the AI provider, or undefined
 * @returns Cleaned CSS selector string, or null if the response is empty or "FAIL"
 */
export function parseAIResponse(raw: string | undefined): string | null {
    if (!raw) return null;

    let result = raw.trim();

    // AI explicitly signals it cannot find a selector
    if (result === 'FAIL') return null;

    // Extract the last backtick-quoted span (e.g. `#selector` or `css selector`)
    const backtickMatch = result.match(/`([^`]+)`/g);
    const lastMatch = backtickMatch ? backtickMatch[backtickMatch.length - 1] : undefined;
    if (lastMatch) {
        result = lastMatch.replace(/`/g, '').trim();
    } else {
        // Strip triple-backtick code fences if present
        result = result.replace(/```/g, '').trim();
    }

    // Remove surrounding quotes that some models add around the selector
    if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
        result = result.substring(1, result.length - 1);
    }

    return result || null;
}
