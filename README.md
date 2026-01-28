# Self-Healing Playwright Agent 🤖🏥

> A resilient test automation wrapper that uses Generative AI (OpenAI or Google Gemini) to automatically fix broken selectors at runtime.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-45ba4b?style=for-the-badge&logo=Playwright&logoColor=white)
![Gemini](https://img.shields.io/badge/google%20gemini-8E75B2?style=for-the-badge&logo=google%20gemini&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)

## The Problem
Test maintenance is the #1 cost in QA. A simple UI refactor (changing an ID from `#submit` to `#signup-btn`) causes the entire suite to fail, requiring manual intervention.

## The Solution
This project introduces an `AutoHealer` class that intercepts standard Playwright failures.
1. **Detect**: Wraps `click` and `fill` actions to catch `TimeoutErrors`.
2. **Analyze**: Captures a snapshot of the current DOM (stripped of scripts/styles).
3. **Recover**: Sends the error + DOM to an AI provider (OpenAI or Gemini), asking for the *new* correct selector.
4. **Heal**: Retries the action with the AI-suggested selector.

## Installation

```bash
npm install
```

## Usage

### 1. Configure Environment
Create a `.env` file. You can use either OpenAI or Google Gemini (or both).

**For Gemini (Recommended for Free Tier):**
```bash
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-2.0-flash
```

**For OpenAI:**
```bash
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4o
```
*Note: Ensure your API key has quota available.*

### 2. Run the Demo
We've included a simulation that intentionally breaks the UI (uses a broken selector) while the test runs. Watch the agent detect and fix it:

```bash
npx playwright test tests/gigantti.spec.ts
```

## Technical Notes

### Module Resolution
This project uses `moduleResolution: nodenext`. This means all relative imports must include the file extension:
```typescript
import { AutoHealer } from '../src/AutoHealer.js'; // Note the .js extension
```

### TypeScript
All source files are written in TypeScript.
- `src/` contains the core logic and Page Objects.
- `tests/` contains the Playwright specs.
- `src/config/index.ts` handles centralized configuration and environment variables.

## How It Works (Code Snippet)

```typescript
// Inside AutoHealer.ts
async click(selector: string) {
  try {
    await this.page.click(selector);
  } catch (error) {
    // If click fails, ask AI (Gemini/OpenAI) for help
    const newSelector = await this.heal(selector, error);
    if (newSelector) {
        await this.page.click(newSelector);
    }
  }
}
```

## Portfolio Notes
This project demonstrates:
- **Agentic Workflows**: Combining LLMs with deterministic runtime logic.
- **Robust Engineering**: Handling errors, sanitizing inputs (DOM minimization), and creating reusable abstractions.
- **Modern QA**: Moving beyond "record and playback" to intelligent, resilient automation.
