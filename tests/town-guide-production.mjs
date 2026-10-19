import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

// Serve only the actual dist build. No source-module replacement, fixture,
// storage seeding, video override or network interception is used here.
const root = resolve('dist');
const prefix = '/baixi-yuji/';
const output = 'docs/town-guide-validation/production-results.json';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
    const file = resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const data = await readFile(file);
    const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, data.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
      if (start > end || start >= data.length) { response.writeHead(416, { 'Content-Range': `bytes */${data.length}` }).end(); return; }
      response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
      response.end(request.method === 'HEAD' ? undefined : data.subarray(start, end + 1)); return;
    }
    response.writeHead(200, { ...headers, 'Content-Length': data.length });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(404).end(); }
});

const checks = [], errors = { javascript: [], console: [], http: [], requests: [] }, responses = [], abortedRequests = [];
let browser;
let currentCheck = 'Start actual production build';
const result = { checkedAt: new Date().toISOString(), status: 'RUNNING', subpath: prefix, servedDirectory: 'dist', channel: 'msedge', viewport: { width: 390, height: 844 }, dataMode: 'unmodified-production-build', checks, errors, abortedRequests };
async function check(name, run) {
  currentCheck = name;
  const evidence = await run();
  checks.push({ name, status: 'PASS', evidence });
  console.log(`PASS: ${name}`);
}
async function camera(page) {
  return page.locator('.map-canvas').evaluate(element => ({ center: element.dataset.mapCenter, zoom: element.dataset.mapZoom, pitch: element.dataset.mapPitch }));
}
async function settledCamera(page) {
  await page.waitForFunction(() => !!document.querySelector('.map-canvas')?.dataset.mapCenter, undefined, { timeout: 30000 });
  let previous = await camera(page), stable = 0;
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForTimeout(150);
    const next = await camera(page);
    if (JSON.stringify(next) === JSON.stringify(previous)) stable++; else stable = 0;
    if (stable >= 4) return next;
    previous = next;
  }
  assert.fail('Map camera did not settle');
}
async function closeSheet(page) {
  await page.locator('dialog[open]').getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
}

try {
  const index = await readFile(resolve(root, 'index.html'));
  result.buildIndexSha256 = createHash('sha256').update(index).digest('hex');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}${prefix}`;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  result.browserVersion = browser.version();
  const page = await browser.newPage({ viewport: result.viewport, locale: 'zh-CN' });
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.javascript.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('response', response => {
    const entry = { url: response.url(), status: response.status(), type: response.request().resourceType() };
    responses.push(entry);
    if (entry.status >= 400) errors.http.push(entry);
  });
  page.on('requestfailed', request => {
    const entry = { url: request.url(), error: request.failure()?.errorText };
    if (entry.error === 'net::ERR_ABORTED') abortedRequests.push(entry); else errors.requests.push(entry);
  });

  await check('Homepage startup reaches done using the actual media', async () => {
    await page.goto(`${base}#/ride`, { waitUntil: 'domcontentloaded' });
    await page.locator('.launch-app[data-launch="done"]').waitFor({ timeout: 30000 });
    await page.locator('.mobile-main[data-screen="ride"]').waitFor();
    assert.equal(await page.locator('.launch-screen').count(), 0);
    const reason = await page.locator('.launch-app').getAttribute('data-launch-reason');
    assert.equal(reason, 'ended', 'Actual local Edge video should play to completion');
    const media = responses.filter(entry => entry.url.includes('/brand/nh-launch-mobile.mp4'));
    assert.ok(media.length && media.every(entry => [200, 206].includes(entry.status)));
    return { screen: 'ride', state: 'done', reason, media: media.map(entry => ({ path: new URL(entry.url).pathname, status: entry.status })) };
  });

  await check('Town opens the genuine complete loop under the production subpath', async () => {
    await page.getByRole('navigation', { name: '主要导航', exact: true }).getByRole('button', { name: '古镇', exact: true }).click();
    await page.locator('.map-card[data-map-scope="loop"]').waitFor();
    await page.getByText('约 143.9 km · 按编号游览', { exact: true }).waitFor();
    const view = await settledCamera(page);
    assert.equal(await page.locator('.map-failed').count(), 0);
    assert.equal(await page.locator('.village-pin').count(), 5);
    const request = responses.find(entry => new URL(entry.url).pathname === `${prefix}geography/travel-loop.json`);
    assert.equal(request?.status, 200, 'The app must load its loop JSON below /baixi-yuji/');
    const actualResponse = await page.request.get(`${base}geography/travel-loop.json`);
    assert.equal(actualResponse.status(), 200);
    const data = await actualResponse.json();
    assert.equal((data.distanceMeters / 1000).toFixed(1), '143.9');
    assert.equal(data.durationSeconds, null);
    const diskData = await readFile(resolve(root, 'geography/travel-loop.json'));
    assert.deepEqual(data, JSON.parse(diskData.toString('utf8')));
    return { localJsonStatus: request.status, localJsonPath: new URL(request.url).pathname, distanceMeters: data.distanceMeters, closureStatus: data.closureStatus, orderedVillageIds: data.orderedVillageIds, sourceSha256: createHash('sha256').update(diskData).digest('hex'), camera: view };
  });

  await check('One real Qingtan POI click opens its introduction and Back closes before navigation', async () => {
    await page.getByRole('combobox', { name: '选择古村', exact: true }).selectOption('qingtan');
    await page.locator('.map-card[data-map-scope="village"][data-selected-village-id="qingtan"]').waitFor();
    const marker = page.locator('.poi-marker[data-poi-id="qingtan-shuangzhi"]');
    await marker.waitFor();
    const before = await settledCamera(page);
    const url = page.url();
    await marker.click();
    await page.locator('dialog[open] .poi-introduction[data-poi-id="qingtan-shuangzhi"]').waitFor();
    assert.equal(await page.locator('dialog[open]').count(), 1);
    assert.match(await page.locator('dialog[open]').innerText(), /双枝庙.*清潭村/s);
    const summary = await page.locator('.poi-summary').innerText();
    assert.ok(summary.length >= 60 && summary.length <= 120);
    await page.getByRole('button', { name: '听一遍', exact: true }).waitFor();
    await page.goBack();
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    assert.equal(page.url(), url, 'Back should close the introduction before leaving the town screen');
    assert.equal(await page.locator('.town-village-card').getAttribute('data-village-id'), 'qingtan');
    const after = await settledCamera(page);
    assert.deepEqual(after, before, 'Closing the introduction must preserve the actual camera');
    assert.equal(await marker.evaluate(element => element === document.activeElement), true);
    return { poiId: 'qingtan-shuangzhi', summaryLength: summary.length, clicksToIntroduction: 1, backKeptHash: new URL(page.url()).hash, cameraBefore: before, cameraAfter: after, focusRestored: true };
  });

  await check('Return-to-loop control restores the overview', async () => {
    await page.getByRole('button', { name: '查看完整环线', exact: true }).click();
    await page.locator('.map-card[data-map-scope="loop"]').waitFor();
    await page.getByText('约 143.9 km · 按编号游览', { exact: true }).waitFor();
    const view = await settledCamera(page);
    assert.equal(await page.locator('.poi-marker').count(), 0);
    return { scope: 'loop', camera: view, visibleVillageNodes: await page.locator('.village-pin').count() };
  });

  await check('Large text set through Settings keeps the real introduction and close button usable', async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '大字号', exact: true }).click();
    await closeSheet(page);
    assert.equal(await page.locator('html').getAttribute('data-text-size'), 'L');
    await page.getByRole('combobox', { name: '选择古村', exact: true }).selectOption('qingtan');
    await settledCamera(page);
    await page.getByRole('button', { name: '景点清单', exact: true }).click();
    assert.deepEqual(await page.locator('.guide-poi-list strong').allTextContents(), ['双枝庙', '三鉴堂']);
    await page.locator('.guide-poi-list').getByRole('button', { name: /双枝庙/ }).click();
    await page.locator('.poi-introduction[data-poi-id="qingtan-shuangzhi"]').waitFor();
    const dialog = page.locator('dialog[open]');
    const geometry = await dialog.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, focusInside: element.contains(document.activeElement) };
    });
    assert.ok(geometry.left >= -1 && geometry.right <= result.viewport.width + 1 && geometry.top >= -1 && geometry.bottom <= result.viewport.height + 1);
    assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1 && geometry.focusInside);
    const close = dialog.getByRole('button', { name: '关闭弹窗', exact: true });
    await close.scrollIntoViewIfNeeded();
    const accessible = await close.evaluate(element => {
      const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { width: rect.width, height: rect.height, inViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight, hitTarget: !!hit && element.contains(hit) };
    });
    assert.ok(accessible.inViewport && accessible.hitTarget && accessible.height >= 44);
    await closeSheet(page);
    return { size: 'L', poiId: 'qingtan-shuangzhi', geometry, closeButton: accessible, closed: true };
  });

  await check('Local fonts and all requested assets load without JavaScript or HTTP failures', async () => {
    const font = await page.evaluate(async () => {
      const faces = await document.fonts.load('16px "Baixi Sans"', '清潭双枝庙');
      await document.fonts.ready;
      return { checked: document.fonts.check('16px "Baixi Sans"', '清潭双枝庙'), loadedFaces: faces.length, status: document.fonts.status };
    });
    assert.ok(font.checked && font.loadedFaces > 0 && font.status === 'loaded');
    const fonts = responses.filter(entry => /\.woff2(?:\?|$)/.test(entry.url));
    assert.ok(fonts.length > 0);
    assert.ok(fonts.every(entry => new URL(entry.url).pathname.startsWith(prefix) && entry.status === 200));
    assert.deepEqual(errors, { javascript: [], console: [], http: [], requests: [] });
    return { font, resources: fonts.map(entry => ({ path: new URL(entry.url).pathname, status: entry.status })), requestedResources: responses.length, errors };
  });
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  checks.push({ name: currentCheck, status: 'FAIL', detail: error.stack });
  process.exitCode = 1;
  console.error(error.stack);
} finally {
  if (browser) await browser.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  result.finishedAt = new Date().toISOString();
  await mkdir('docs/town-guide-validation', { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(`${result.status}: production town guide (${checks.filter(check => check.status === 'PASS').length} checks), ${output}`);
}
