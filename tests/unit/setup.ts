
import { vi } from 'vitest';

// Mock process.env before config is imported
process.env.BASE_URL = 'https://www.gigantti.fi/';
process.env.GEMINI_API_KEY = 'fake-key';
process.env.AI_PROVIDER = 'gemini';
