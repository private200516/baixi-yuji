import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const boards = JSON.parse(await readFile('design/snapshots.json', 'utf8')).artboards;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const baseURL = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const regions = [];
const selectors = ['.app-topbar', '.trip-header', '.size-controls', '.teal-content', '.notch-action button', '.return-mini', '.terracotta', '.vertical-signature', '.groove-nav', '.groove-item', '.senior-topbar', '.senior-heading', '.senior-boarding', '.senior-tasks', '.senior-tasks button', '.senior-scan-card', '.senior-return-card', '.senior-primary', '.senior-help-card', '.sheet-top', '.settings-font', '.settings-senior', '.settings-motion'];
for (const board of boards) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript(prefs => localStorage.setItem('baixi.mobile.v2', JSON.stringify(prefs)), { size: board.size, regularSize: 'M', senior: board.senior, favorite: false, savedReturn: null, quiet: true });
  const page = await context.newPage();
  await page.goto(`${baseURL}/#/${board.screen}`);
  await page.evaluate(async () => { await Promise.all([document.fonts.load('400 16px "Baixi Sans"'), document.fonts.load('900 16px "Baixi Sans"'), document.fonts.load('400 16px "Baixi Kai"')]); await document.fonts.ready; });
  if (board.id === 'regular-settings') await page.locator('.app-settings').click();
  const groups = await page.evaluate(selectors => selectors.flatMap(selector => [...document.querySelectorAll(selector)].map((el, index) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return { selector, index, name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 60), x: r.x, y: r.y, width: r.width, height: r.height, display: s.display, flexDirection: s.flexDirection, gap: s.gap, justifyContent: s.justifyContent, alignItems: s.alignItems, padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft] };
  })).filter(r => r.width && r.height), selectors);
  for (const group of groups) group.sourceIds = board.nodes.filter(n => n.x >= group.x - .5 && n.y >= group.y - .5 && n.x + n.width <= group.x + group.width + .5 && n.y + n.height <= group.y + group.height + .5).map(n => n.id);
  regions.push({ id: board.id, regions: groups });
  await context.close();
}
await browser.close();
await writeFile('design/component-regions.json', JSON.stringify(regions));
console.log(JSON.stringify({ artboards: regions.length, regions: regions.reduce((sum, b) => sum + b.regions.length, 0) }));
