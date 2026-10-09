import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const requests = [], failedResponses = [], uncaughtErrors = [];
page.on('request', request => requests.push(request.url()));
page.on('response', response => { if (response.status() >= 400) failedResponses.push([response.status(), response.url()]); });
page.on('pageerror', error => uncaughtErrors.push(error.message));
try {
  await page.goto(`${base}/#/ride`);
  await page.locator('.village-pin').first().waitFor({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.getByTestId('map-view').getByRole('button', { name: '立体', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.map-canvas')?.dataset.mapPitch === '42');
  await page.getByRole('button', { name: '选择古村', exact: true }).click();
  await page.locator('dialog [data-village-id=longgong]').click();
  await page.locator('.journey-card').click();
  await page.getByLabel('终点古村', { exact: true }).selectOption('longgong');
  await page.getByTestId('route-status').locator('h3').waitFor();
  const routeId = await page.getByTestId('route-status').getAttribute('data-route-id');
  await page.getByRole('button', { name: '在地图上查看', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.map-card')?.dataset.mapScope === 'route');
  await mkdir('docs/round2-screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/round2-screenshots/production-390.png', fullPage: true });
  const report = {
    checkedAt: new Date().toISOString(), base, title: await page.title(),
    brand: await page.locator('.xiangxu-wordmark').innerText(), routeId,
    scope: await page.getByTestId('map-scope').getAttribute('data-scope'),
    fontRequests: requests.filter(url => url.endsWith('.woff2')),
    workerRequested: requests.some(url => /maplibre-gl-worker.*\.mjs$/.test(url)),
    externalRequests: requests.filter(url => !url.startsWith(base + '/') && !url.startsWith('blob:') && !url.startsWith('data:')),
    failedResponses, uncaughtErrors,
  };
  report.status = report.title.startsWith('乡序') && report.brand === '乡序'
    && routeId === 'xujiashan-longgong' && report.scope === 'route' && report.workerRequested
    && report.fontRequests.length === 2 && !failedResponses.length && !uncaughtErrors.length
    && !report.externalRequests.length ? 'PASS' : 'FAIL';
  await writeFile('docs/round2-production-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.status, 'PASS');
} finally {
  await browser.close();
}
