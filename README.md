# Self-Healing Playwright Agent 🤖🏥

> A resilient test automation wrapper that uses Generative AI to automatically fix broken selectors at runtime.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-45ba4b?style=for-the-badge&logo=Playwright&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)

## The Problem
Test maintenance is the #1 cost in QA. A simple UI refactor (changing an ID from `#submit` to `#signup-btn`) causes the entire suite to fail, requiring manual intervention.

## The Solution
This project introduces an `AutoHealer` class that intercepts standard Playwright failures.
1. **Detect**: Wraps `click` and `fill` actions to catch `TimeoutErrors`.
2. **Analyze**: Captures a snapshot of the current DOM (stripped of scripts/styles).
3. **Recover**: Sends the error + DOM to GPT-4o, asking for the *new* correct selector.
4. **Heal**: Retries the action with the AI-suggested selector.

## Installation

```bash
npm install
```

## Usage

### 1. Configure Environment
Create a `.env` file with your OpenAI key:
```bash
OPENAI_API_KEY=sk-your-key-here
```

### 2. Run the Demo
We've included a simulation that intentionally breaks the UI (renames a button) while the test runs. Watch the agent detect and fix it:

```bash
npx playwright test tests/simulation.spec.ts
```

## How It Works (Code Snippet)

```typescript
// Inside AutoHealer.ts
async click(selector: string) {
  try {
    await this.page.click(selector);
  } catch (error) {
    // If click fails, ask AI for help
    const newSelector = await this.heal(selector, error);
    await this.page.click(newSelector);
  }
}
```

## Portfolio Notes
This project demonstrates:
- **Agentic Workflows**: Combining LLMs with deterministic runtime logic.
- **Robust Engineering**: Handling errors, sanitizing inputs (DOM minimization), and creating reusable abstractions.
- **Modern QA**: Moving beyond "record and playback" to intelligent, resilient automation.
