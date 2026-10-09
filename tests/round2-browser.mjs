import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = 'docs/round2-screenshots';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const results = [];
const measurements = {};
const browserErrors = [];
const filter = process.env.ROUND2_TEST_FILTER ? new RegExp(process.env.ROUND2_TEST_FILTER, 'i') : null;
const researchFixture = JSON.parse(await readFile('public/geography/route-research.json', 'utf8'));
const pages = new Set();
const check = async (name, run) => {
  if (filter && !filter.test(name)) return;
  try { await run(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', detail: error.message }); }
  finally { await Promise.all([...pages].map(page => page.close())); pages.clear(); }
};
async function newPage(width = 390, height = 844, options = {}) {
  const page = await browser.newPage({ viewport: { width, height }, ...options });
  pages.add(page);
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => browserErrors.push(error.message));
  return page;
}
async function ready(page, route = 'ride') {
  await page.goto(`${base}/#/${route}`);
  await page.locator('.village-summary').first().waitFor();
  await page.locator('.village-pin').first().waitFor({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
}
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.width + 1, `horizontal overflow: ${dimensions.scroll} > ${dimensions.width}`);
}
async function inViewport(locator) {
  assert.ok(await locator.evaluate(el => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
  }), 'essential first-screen content outside viewport');
}
async function checkCountyPins(page) {
  const status = await page.locator('.map-card').evaluate(card => {
    const box = card.getBoundingClientRect();
    const pins = [...card.querySelectorAll('.pin-dot')].map(pin => pin.getBoundingClientRect());
    const visibleLabels = [...card.querySelectorAll('.pin-name')].filter(label => getComputedStyle(label).display !== 'none').map(label => label.getBoundingClientRect());
    const inside = rect => rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom;
    const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return { pins: pins.length, pinsInside: pins.every(inside), labelsInside: visibleLabels.every(inside), labelsSeparate: visibleLabels.every((a, i) => !visibleLabels.slice(i + 1).some(b => overlap(a, b))) };
  });
  assert.equal(status.pins, 5); assert.ok(status.pinsInside, 'county view clips real village pins');
  assert.ok(status.labelsInside && status.labelsSeparate, 'visible county labels clip or overlap');
}
async function chooseVillage(page, id) {
  await page.getByRole('button', { name: '选择古村', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator(`.village-options [data-village-id="${id}"]`).click();
  if (await dialog.count() && await dialog.isVisible()) await page.keyboard.press('Escape');
  assert.equal(await page.locator('.village-summary').first().getAttribute('data-selected-village-id'), id);
}

await check('390 × 844: original mobile shell, complete primary view, four right navigation slots', async () => {
  const page = await newPage();
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await ready(page);
  await noOverflow(page);
  await checkCountyPins(page);
  assert.equal(await page.locator('.groove-item:visible').count(), 4);
  await inViewport(page.locator('.village-summary').first());
  await page.screenshot({ path: `${output}/390-home.png`, fullPage: true });
  await inViewport(page.locator('.journey-card'));
  measurements.phone390 = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight], documentHeight: document.documentElement.scrollHeight,
    bodyFontPixels: parseFloat(getComputedStyle(document.querySelector('.geography-app')).fontSize),
    rightRailPixels: document.querySelector('.desktop-navigation').getBoundingClientRect().width,
    journeyBottom: document.querySelector('.journey-card').getBoundingClientRect().bottom,
    chooseButtonHeight: document.querySelector('.notch-action button').getBoundingClientRect().height,
    map: { width: document.querySelector('.map-card').getBoundingClientRect().width, height: document.querySelector('.map-card').getBoundingClientRect().height },
  }));
  assert.ok(measurements.phone390.chooseButtonHeight >= 56);
  assert.ok(await page.locator('.map-attribution').isVisible());
  assert.ok(requests.every(url => url.startsWith(base) || url.startsWith('data:') || url.startsWith('blob:')), 'unexpected external runtime request');
  assert.doesNotMatch(await page.locator('body').innerText(), /白溪舆记|S-384|5\s*路|公交预计到站|实时公交定位/);
  assert.equal(await page.locator('.xiangxu-wordmark').innerText(), '乡序');
});

await check('Endpoints, independent outbound/return research, local plan persistence', async () => {
  const page = await newPage(); await ready(page);
  await page.locator('.journey-card').click();
  await page.getByLabel('起点古村', { exact: false }).selectOption('longgong');
  await page.getByLabel('终点古村', { exact: false }).selectOption('xujiashan');
  await page.getByTestId('route-status').locator('h3').waitFor();
  assert.equal(await page.getByTestId('journey-summary').getAttribute('data-start'), 'longgong');
  assert.equal(await page.getByTestId('journey-summary').getAttribute('data-end'), 'xujiashan');
  const outbound = researchFixture.routes.find(route => route.id === 'longgong-xujiashan');
  const inbound = researchFixture.routes.find(route => route.id === 'xujiashan-longgong');
  const distance = () => page.locator('.route-distance').innerText();
  assert.equal(await page.getByTestId('route-status').getAttribute('data-route-id'), outbound.id);
  assert.match(await distance(), new RegExp((outbound.distanceMeters / 1000).toFixed(1).replace('.', '\\.')));
  assert.match(await page.getByTestId('route-status').innerText(), /无可靠行程时长/);
  await page.getByRole('dialog').getByRole('button', { name: '返程', exact: true }).click();
  assert.equal(await page.getByTestId('route-status').getAttribute('data-route-id'), inbound.id);
  assert.match(await distance(), new RegExp((inbound.distanceMeters / 1000).toFixed(1).replace('.', '\\.')));
  assert.notEqual(outbound.distanceMeters, inbound.distanceMeters, 'chosen fixture must prove separately computed directions');
  assert.equal(await page.getByTestId('route-status').locator('h3').innerText(), '许家山村 → 龙宫村');
  await page.getByRole('button', { name: '保存本地研究计划', exact: true }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('xiangxu.local-plan')));
  assert.deepEqual({ from: stored.from, to: stored.to, direction: stored.direction, operatingStatus: stored.operatingStatus }, { from: 'longgong', to: 'xujiashan', direction: 'return', operatingStatus: 'research-not-confirmed' });
  assert.equal(stored.dataVersion, researchFixture.version); assert.ok(Number.isFinite(Date.parse(stored.savedAt)));
  await page.screenshot({ path: `${output}/journey-return-plan.png`, fullPage: true });
  await page.reload(); await page.locator('.journey-card').click();
  assert.ok(await page.getByTestId('saved-plan').isVisible());
  await page.getByRole('button', { name: '恢复这个计划', exact: true }).click();
  assert.equal(await page.getByLabel('起点古村', { exact: false }).inputValue(), 'longgong');
  assert.equal(await page.getByLabel('终点古村', { exact: false }).inputValue(), 'xujiashan');
  await page.getByRole('button', { name: '在地图上查看', exact: true }).click();
  assert.equal(await page.getByTestId('map-scope').getAttribute('data-scope'), 'route');
  assert.equal(await page.locator('.map-card').getAttribute('data-map-scope'), 'route');
  await noOverflow(page);
});

await check('Full-screen map keeps village list, attribution and view controls; Escape restores shell', async () => {
  const page = await newPage(); await ready(page);
  const beforeId = await page.locator('.map-card').getAttribute('data-selected-village-id');
  await page.getByRole('button', { name: '全屏地图', exact: true }).click();
  await page.getByRole('button', { name: '立体', exact: true }).click();
  assert.equal(await page.locator('.map-card').getAttribute('data-map-depth'), 'relief');
  assert.equal(await page.locator('.map-card').getAttribute('data-selected-village-id'), beforeId);
  await page.getByRole('button', { name: '村内', exact: true }).click();
  assert.equal(await page.locator('.map-card').getAttribute('data-map-scope'), 'village');
  await page.getByRole('button', { name: '恢复北向与当前范围', exact: true }).click();
  assert.ok(await page.locator('.map-attribution').isVisible());
  assert.match(await page.locator('.map-status').innerText(), /平面地形|建筑|载入/);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${output}/390-village-relief.png`, fullPage: true });
  await page.getByRole('button', { name: '平面', exact: true }).click();
  assert.equal(await page.locator('.map-card').getAttribute('data-map-depth'), 'flat');
  assert.equal(await page.locator('.map-card').getAttribute('data-map-scope'), 'village');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${output}/390-village-flat.png`, fullPage: true });
  await page.locator('.fullscreen-villages').click();
  await page.keyboard.press('Escape');
  assert.ok(await page.getByRole('button', { name: '退出全屏地图', exact: true }).isVisible(), 'closing the top dialog must preserve the fullscreen map');
  await page.locator('.fullscreen-villages').click();
  await page.getByRole('dialog').locator('.village-options [data-village-id=longgong]').click();
  assert.equal(await page.locator('.map-card').getAttribute('data-selected-village-id'), 'longgong');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: '退出全屏地图', exact: true }).count(), 0);
  assert.ok(await page.locator('.journey-card').isVisible());
  await page.getByRole('button', { name: '全屏地图', exact: true }).click();
  await page.getByRole('button', { name: '退出全屏地图', exact: true }).click();
  assert.ok(await page.locator('.journey-card').isVisible());
});

await check('Direct return URL and browser history retain the return direction', async () => {
  const page = await newPage(); await page.goto(`${base}/#/return`);
  await page.getByLabel('起点古村', { exact: false }).selectOption('longgong');
  await page.getByLabel('终点古村', { exact: false }).selectOption('xujiashan');
  await page.getByTestId('route-status').locator('h3').waitFor();
  assert.equal(await page.getByTestId('route-status').getAttribute('data-route-id'), 'xujiashan-longgong');
  assert.equal(await page.locator('.direction-controls').getByRole('button', { name: '返程', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.locator('.groove-item').filter({ hasText: '乘车' }).click();
  await page.evaluate(() => history.back());
  await page.getByTestId('route-status').waitFor();
  assert.equal(await page.locator('.direction-controls').getByRole('button', { name: '返程', exact: true }).getAttribute('aria-pressed'), 'true');
});

await check('Road research timeout leaves loading and exposes retry', async () => {
  const page = await newPage();
  await page.clock.install();
  await page.route('**/geography/route-research.json', () => new Promise(() => {}));
  await ready(page);
  await page.locator('.journey-card').click();
  await page.getByLabel('起点古村', { exact: false }).selectOption('longgong');
  await page.getByLabel('终点古村', { exact: false }).selectOption('xujiashan');
  await page.clock.fastForward(16000);
  await page.getByRole('button', { name: '重新载入道路数据', exact: true }).waitFor();
  assert.match(await page.getByTestId('route-status').innerText(), /无法载入/);
});

await check('Missing road research produces an explicit empty state instead of a fake route', async () => {
  const page = await newPage();
  await page.route('**/geography/route-research.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await ready(page); await page.locator('.journey-card').click();
  await page.getByLabel('起点古村', { exact: false }).selectOption('longgong');
  await page.getByLabel('终点古村', { exact: false }).selectOption('xujiashan');
  assert.match(await page.getByTestId('route-status').innerText(), /无法载入/);
  assert.equal(await page.locator('.route-distance').count(), 0);
  assert.equal(await page.getByRole('button', { name: '保存本地研究计划', exact: true }).count(), 0);
});

await check('Disconnected sample reports its reason and disables map/save route actions', async () => {
  const page = await newPage();
  const fixture = structuredClone(researchFixture);
  const disconnected = fixture.routes.find(route => route.id === 'longgong-xujiashan');
  Object.assign(disconnected, { coordinates: null, geometryStatus: 'unavailable', distanceMeters: null, unavailableReason: '这两个道路参考点在当前样本中不连通。' });
  await page.route('**/geography/route-research.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
  await ready(page); await page.locator('.journey-card').click();
  await page.getByLabel('起点古村', { exact: false }).selectOption('longgong');
  await page.getByLabel('终点古村', { exact: false }).selectOption('xujiashan');
  assert.match(await page.getByTestId('route-status').innerText(), /不连通/);
  assert.equal(await page.getByTestId('route-status').getAttribute('data-geometry-status'), 'unavailable');
  assert.equal(await page.locator('.route-distance').count(), 0);
  assert.equal(await page.getByRole('button', { name: '在地图上查看', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '保存本地研究计划', exact: true }).count(), 0);
});

await check('Senior mode hides map complexity, keeps large controls and persists', async () => {
  const page = await newPage(); await ready(page);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('老年人模式', { exact: false }).check();
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  assert.equal(await page.locator('.map-card').count(), 0);
  assert.equal(await page.locator('.groove-item:visible').count(), 0);
  assert.ok(await page.getByRole('button', { name: '选择要去的古村', exact: true }).isVisible());
  await page.getByRole('button', { name: '选择要去的古村', exact: true }).click();
  await page.getByRole('dialog').locator('.village-options [data-village-id=qingtan]').click();
  assert.equal(await page.locator('.village-summary').getAttribute('data-selected-village-id'), 'qingtan');
  await page.getByRole('button', { name: '查看村落说明', exact: true }).click();
  assert.match(await page.getByRole('dialog').innerText(), /清潭村/);
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  await page.locator('.journey-card').click();
  assert.equal(await page.getByLabel('终点古村', { exact: false }).inputValue(), 'qingtan');
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  await noOverflow(page);
  await page.screenshot({ path: `${output}/390-senior.png`, fullPage: true });
  await page.reload(); assert.equal(await page.locator('.senior-mode').count(), 1);
});

await check('Map and village chooser share selection; quick selection keeps the last village', async () => {
  const page = await newPage(); await ready(page);
  await chooseVillage(page, 'qingtan');
  assert.equal(await page.locator('.village-pin[data-village-id=qingtan]').getAttribute('aria-pressed'), 'true');
  await chooseVillage(page, 'longgong');
  await chooseVillage(page, 'ruoao');
  assert.equal(await page.locator('.village-pin[data-village-id=ruoao]').getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '查看村落', exact: true }).click();
  assert.match(await page.getByRole('dialog').innerText(), /箬岙/);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
});

await check('390px groove morphs while all navigation slots remain fixed', async () => {
  const page = await newPage(); await ready(page);
  const coordinates = () => page.locator('.groove-item').evaluateAll(items => items.map(el => {
    const rect = el.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  const before = await coordinates();
  const oldPath = await page.locator('.groove-outline').getAttribute('d');
  await page.locator('.groove-item').filter({ hasText: '返程' }).click();
  await page.waitForTimeout(550);
  assert.notEqual(await page.locator('.groove-outline').getAttribute('d'), oldPath);
  assert.deepEqual(await coordinates(), before);
  const center = Number(await page.locator('.groove-outline').getAttribute('data-center'));
  assert.equal(Number(await page.locator('.groove-disc').getAttribute('cy')), center);
  await page.screenshot({ path: `${output}/390-return.png`, fullPage: true });
});

for (const [width, height] of [[320, 568], [360, 740], [768, 1024], [1440, 1024]]) {
  await check(`${width}px layout reflows without horizontal clipping`, async () => {
    const page = await newPage(width, height); await ready(page); await noOverflow(page);
    assert.ok(await page.locator('.map-attribution').isVisible());
    if (width <= 360) {
      assert.equal(await page.locator('.groove-item:visible').count(), 0);
      await page.getByRole('button', { name: '打开右侧导航', exact: true }).click();
      assert.ok(await page.getByRole('dialog').isVisible());
      await page.keyboard.press('Escape');
      assert.ok(await page.getByRole('button', { name: '打开右侧导航', exact: true }).evaluate(el => el === document.activeElement));
    }
    await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
  });
}

await check('Small/medium/large affect text; large and 200% text reflow use right drawer', async () => {
  const page = await newPage(); await ready(page);
  const sample = page.locator('.village-summary').first();
  const sizes = [];
  for (const label of ['小', '中', '大']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    sizes.push(await sample.evaluate(el => parseFloat(getComputedStyle(el).fontSize)));
    await noOverflow(page);
  }
  assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2], `font scales: ${sizes}`);
  assert.equal(await page.locator('.groove-item:visible').count(), 0);
  await page.screenshot({ path: `${output}/390-large.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => document.querySelector('.geography-app').style.setProperty('--body-size', '40px'));
  await noOverflow(page);
  await page.screenshot({ path: `${output}/320-text-200.png`, fullPage: true });
  const reflow = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.scope-controls button,.expand-map,.map-tools button,.font-controls button')].filter(el => el.getBoundingClientRect().width > 0);
    const clippedButtons = buttons.filter(el => { const rect = el.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1; }).map(el => el.getAttribute('aria-label') || el.textContent.trim());
    const title = document.querySelector('.mobile-hero h1'), strap = document.querySelector('.brand-strap');
    const titleWidth = title.getBoundingClientRect().width, titleSize = parseFloat(getComputedStyle(title).fontSize);
    const strapWidth = strap.getBoundingClientRect().width, strapSize = parseFloat(getComputedStyle(strap).fontSize);
    const status = document.querySelector('.map-status'), attribution = document.querySelector('.map-attribution');
    const statusClear = !status || getComputedStyle(status).display === 'none' || status.getBoundingClientRect().bottom <= attribution.getBoundingClientRect().top;
    return { clippedButtons, titleWidth, titleSize, strapWidth, strapSize, statusClear };
  });
  assert.deepEqual(reflow.clippedButtons, [], '200% text clips control labels or buttons');
  assert.ok(reflow.titleWidth >= Math.min(240, reflow.titleSize * 2), '200% title is squeezed into one-character columns');
  assert.ok(reflow.strapWidth >= reflow.strapSize * 2, '200% brand subtitle is squeezed into one-character columns');
  assert.ok(reflow.statusClear, 'map attribution covers its status text');
});

await check('Reduced motion preference and previous-release preference migration', async () => {
  const page = await newPage(390, 844, { reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('baixi.mobile.v2', JSON.stringify({ size: 'L', quiet: true, senior: false })));
  await ready(page);
  assert.equal(await page.locator('html').getAttribute('data-motion'), 'reduced');
  assert.equal(await page.getByRole('button', { name: '大', exact: true }).getAttribute('aria-pressed'), 'true');
});

for (const mode of ['http', 'webgl', 'storage']) {
  await check(`${mode} failure preserves text village selection and honest state`, async () => {
    const page = await newPage();
    if (mode === 'http') await page.route('**/geography/roads.geojson', route => route.fulfill({ status: 503, body: 'unavailable' }));
    if (mode === 'webgl') await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { if (String(type).startsWith('webgl')) return null; return original.call(this, type, ...args); };
    });
    if (mode === 'storage') await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('disabled'); };
      Storage.prototype.setItem = () => { throw new Error('disabled'); };
    });
    await page.goto(`${base}/#/ride`);
    if (mode === 'storage') await page.getByText(/仅在本次|无法保存/).first().waitFor();
    else await page.locator('.map-message').waitFor();
    await chooseVillage(page, 'longgong'); await noOverflow(page);
    if (mode === 'http') await page.screenshot({ path: `${output}/map-fallback.png`, fullPage: true });
  });
}

results.push({ name: 'Uncaught browser errors', status: browserErrors.length ? 'FAIL' : 'PASS', detail: browserErrors });
await browser.close();
await writeFile(filter ? 'docs/round2-browser-partial-results.json' : 'docs/round2-browser-results.json', JSON.stringify({ date: '2026-10-09', base, measurements, results }, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.some(result => result.status === 'FAIL')) process.exitCode = 1;
