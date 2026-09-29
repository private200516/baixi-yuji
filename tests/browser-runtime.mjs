import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
export const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
export const baseURL = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
export const launchOptions = {
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
};

await mkdir('docs/mobile-screenshots', { recursive: true });
