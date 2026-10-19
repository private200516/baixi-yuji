import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { getMappableVillagePois, getVillagePois } from '../src/geography/poiCatalog.ts';

// Real application rendering in a fresh profile. Fault cases override only this
// browser's responses and are explicitly distinguished from published evidence.
const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = 'docs/town-guide-validation';
const filter = process.env.TOWN_GUIDE_FILTER ? new RegExp(process.env.TOWN_GUIDE_FILTER, 'i') : null;
const baselineRoot = resolve('.delivery/town-guide-v222-baseline');
const checks = [], pages = new Set(), errors = [], captures = [];
const loop = JSON.parse(await readFile('public/geography/travel-loop.json', 'utf8'));
const names = { qingtan: '清潭村', longgong: '龙宫村', xujiashan: '许家山村', meizhitian: '梅枝田村', ruoao: '箬岙村' };
const availableVillages = Object.keys(names).sort((a, b) => getMappableVillagePois(b).length - getMappableVillagePois(a).length);
const richest = availableVillages[0];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });

async function check(name, run) {
  if (filter && !filter.test(name)) return;
  const begin = errors.length;
  try { checks.push({ name, status: 'PASS', evidence: await run(), uncaughtErrors: errors.slice(begin) }); }
  catch (error) {
    checks.push({ name, status: 'FAIL', detail: error.stack, uncaughtErrors: errors.slice(begin) });
    for (const [index, page] of [...pages].entries()) await page.screenshot({ path: `${output}/failure-${checks.length}-${index}.png` }).catch(() => {});
  } finally { await Promise.all([...pages].map(page => page.close())); pages.clear(); }
  console.log(`${checks.at(-1).status}: ${name}${checks.at(-1).detail ? '\n' + checks.at(-1).detail : ''}`);
  await writeFile(`${output}/progress.json`, JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
}
async function pageFor(width = 390, height = 844, { size = 'M', webgl = true, poiOverride = null, loopFailure = false, loopOverride = null } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, locale: 'zh-CN', reducedMotion: 'reduce' });
  pages.add(page); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ size, webgl }) => {
    if (!sessionStorage.getItem('town-guide-test')) {
      localStorage.setItem('baixi.mobile.v2', JSON.stringify({ size, regularSize: size, senior: false, favorite: false, savedReturn: null, quiet: true }));
      sessionStorage.setItem('town-guide-test', 'true');
    }
    window.__guideSpeechCalls = 0;
    if ('speechSynthesis' in window) { speechSynthesis.getVoices = () => []; speechSynthesis.speak = () => { window.__guideSpeechCalls++; }; }
    if (!webgl) {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/.test(type) ? null : original.call(this, type, ...args); };
    }
  }, { size, webgl });
  if (loopFailure) await page.route('**/geography/travel-loop.json*', route => route.fulfill({ status: 404, body: 'Test: loop unavailable' }));
  else if (loopOverride) await page.route('**/geography/travel-loop.json*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(loopOverride) }));
  if (poiOverride) {
    // Vite module replacement is used only for explicit null/empty/broken-image
    // fault tests; production screenshots always use the unmodified catalog.
    const source = `export const villagePois=${JSON.stringify(poiOverride)};
export const poiCategoryLabels=${JSON.stringify({ 'historic-house': '古民居', 'ancestral-hall': '宗祠家庙', bridge: '古桥', academy: '书院书舍', temple: '古庙戏台', tower: '古塔', 'agricultural-heritage': '农耕遗存' })};
export function getVillagePois(id){return villagePois.filter(p=>p.villageId===id&&p.verificationStatus.identity==='verified'&&p.verificationStatus.summary==='verified')}
export function getMappableVillagePois(id){return getVillagePois(id).filter(p=>p.verificationStatus.coordinates==='verified'&&p.normalizedCoordinate&&p.coordinateSources.length)}
export function getPoiById(id){return villagePois.find(p=>p.id===id)}`;
    await page.route('**/src/geography/poiCatalog.ts*', route => route.fulfill({ contentType: 'application/javascript', body: source }));
  }
  return page;
}
async function load(page, screen = 'town', url = base) {
  await page.goto(`${url}/#/${screen}`);
  await page.locator('.launch-app[data-launch="done"]').waitFor({ timeout: 20000 });
  await page.locator(`.mobile-main[data-screen="${screen}"]`).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function readyMap(page) {
  await page.waitForFunction(() => !!document.querySelector('.map-canvas')?.dataset.mapCenter, undefined, { timeout: 30000 });
  await page.waitForTimeout(250);
}
async function camera(page) { return page.locator('.map-canvas').evaluate(element => ({ center: element.dataset.mapCenter, zoom: element.dataset.mapZoom, pitch: element.dataset.mapPitch })); }
async function select(page, id) {
  await page.getByRole('combobox', { name: '选择古村', exact: true }).selectOption(id);
  await page.locator(`.map-card[data-map-scope="village"][data-selected-village-id="${id}"]`).waitFor();
  await page.waitForTimeout(180);
}
async function openList(page) { await page.getByRole('button', { name: '景点清单', exact: true }).click(); await page.locator('dialog[open] .town-guide-content').waitFor(); }
async function close(page) { await page.locator('dialog[open]').getByRole('button', { name: '关闭弹窗', exact: true }).click(); await page.locator('dialog[open]').waitFor({ state: 'detached' }); }
async function introFromList(page, poi = getVillagePois(richest)[0]) {
  assert.ok(poi, 'A verified real POI is required for this check');
  await openList(page);
  await page.locator('dialog[open] .guide-poi-list').getByRole('button', { name: new RegExp(poi.officialName) }).click();
  await page.locator(`.poi-introduction[data-poi-id="${poi.id}"]`).waitFor();
  return poi;
}
async function snapshot(page, name, nature = 'actual-catalog') {
  const path = `${output}/${name}.png`;
  await page.screenshot({ path });
  captures.push({ path, nature, viewport: page.viewportSize(), hash: new URL(page.url()).hash });
  return path;
}
async function bounds(page, selectors = ['.town-title-card', '.town-route-identity', '.town-village-picker', '.town-return-action', '.town-route-action', '.town-poi-action']) {
  const issues = await page.evaluate(selectors => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('horizontal document overflow');
    for (const selector of selectors) for (const element of document.querySelectorAll(selector)) {
      const box = element.getBoundingClientRect(); if (!box.width || !box.height) continue;
      if (box.left < -1 || box.right > innerWidth + 1 || box.top < -1 || box.bottom > innerHeight + 1) issues.push(`${selector}: outside viewport`);
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      if (!hit || !element.contains(hit)) issues.push(`${selector}: blocked center`);
    }
    return issues;
  }, selectors);
  assert.deepEqual(issues, []);
}
async function checkDialog(page) {
  const dialog = page.locator('dialog[open]');
  const geometry = await dialog.evaluate(element => {
    const box = element.getBoundingClientRect(), title = document.getElementById(element.getAttribute('aria-labelledby'));
    return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, width: box.width, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, title: title?.textContent, focusInside: element.contains(document.activeElement), activeElement: document.activeElement?.outerHTML.slice(0, 250) };
  });
  assert.ok(geometry.x >= -1 && geometry.right <= page.viewportSize().width + 1, 'Dialog horizontal overflow');
  assert.ok(geometry.y >= -1 && geometry.bottom <= page.viewportSize().height + 1, 'Dialog vertical boundary overflow');
  assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, 'Dialog horizontal content overflow');
  assert.ok(geometry.title && geometry.focusInside, `Dialog title/focus: ${JSON.stringify(geometry)}`);
  await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).scrollIntoViewIfNeeded();
  await bounds(page, ['dialog[open] .sheet-close']);
  return geometry;
}

await check('390px initial full loop, genuine order, road-return evidence and controls', async () => {
  const page = await pageFor(); await load(page); await readyMap(page);
  assert.equal(await page.locator('.map-card').getAttribute('data-map-scope'), 'loop');
  await page.getByText('约 143.9 km · 按编号游览', { exact: true }).waitFor();
  await bounds(page);
  const numbered = await page.locator('.village-pin').evaluateAll(items => items.map(item => ({ id: item.dataset.villageId, number: item.querySelector('.pin-dot')?.textContent, label: item.getAttribute('aria-label'), members: item.dataset.villageGroupIds?.split(',') || [item.dataset.villageId], visible: getComputedStyle(item).visibility !== 'hidden' && getComputedStyle(item).display !== 'none' })));
  assert.equal(numbered.length, 5);
  assert.deepEqual(new Set(numbered.filter(item => item.visible).flatMap(item => item.members)), new Set(loop.orderedVillageIds));
  for (const item of numbered.filter(item => item.visible)) {
    if (item.members.length === 1) assert.equal(item.number, String(loop.orderedVillageIds.indexOf(item.id) + 1));
    else { assert.equal(item.number, `${item.members.length}村`); for (const id of item.members) assert.match(item.label, new RegExp(names[id])); }
  }
  await snapshot(page, '390-overview');
  await page.getByRole('button', { name: '环线与游览顺序', exact: true }).click();
  assert.match(await page.locator('dialog[open]').innerText(), /规划环线.*非运营信息/s);
  assert.deepEqual(await page.locator('.guide-village-order strong').allTextContents(), loop.orderedVillageIds.map(id => names[id]));
  assert.match(await page.locator('.guide-loop-return').innerText(), /清潭村/);
  const sheet = await checkDialog(page); await close(page);
  return { camera: await camera(page), numbered, sheet, exactReturnSegment: loop.orderedSegmentIds.at(-1), noInventedEta: loop.durationSeconds === null };
});

for (const [width, height] of [[390, 844], [320, 568]]) await check(`${width}px large font list and introduction wrap, scroll and close accessibly`, async () => {
  const page = await pageFor(width, height, { size: 'L' }); await load(page); await readyMap(page); await bounds(page);
  await snapshot(page, `${width}-large-overview`);
  await select(page, richest); await openList(page);
  assert.equal(await page.locator('.guide-poi-list li').count(), getVillagePois(richest).length);
  const list = await checkDialog(page); await snapshot(page, `${width}-large-list`);
  const first = getVillagePois(richest)[0]; assert.ok(first);
  await page.locator('.guide-poi-list').getByRole('button', { name: new RegExp(first.officialName) }).click();
  const intro = await checkDialog(page);
  await page.locator('.guide-listen').scrollIntoViewIfNeeded(); await bounds(page, ['dialog[open] .guide-listen']);
  await snapshot(page, `${width}-large-intro`);
  await page.locator('.guide-listen').click();
  await page.locator('.guide-message').waitFor();
  assert.equal(await page.evaluate(() => window.__guideSpeechCalls), 0, 'No remote/automatic speech should be triggered');
  await close(page);
  assert.equal(await page.getByRole('button', { name: '景点清单', exact: true }).evaluate(element => element === document.activeElement), true);
  return { list, intro, font: 'L', realPoiId: first.id };
});

await check('320px large overview groups colliding villages into nonoverlapping touch targets', async () => {
  const page = await pageFor(320, 568, { size: 'L' }); await load(page); await readyMap(page); await bounds(page);
  const targets = await page.locator('.village-pin').evaluateAll(elements => elements.filter(element => getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none').map(element => {
    const rect = element.getBoundingClientRect(); return { villageId: element.dataset.villageId, members: element.dataset.villageGroupIds?.split(',') || [], left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, tabIndex: element.tabIndex, label: element.getAttribute('aria-label') };
  }));
  assert.ok(targets.some(target => target.members.length > 1), 'This small viewport should expose a grouped village action');
  assert.deepEqual(new Set(targets.flatMap(target => target.members)), new Set(loop.orderedVillageIds));
  for (const target of targets) assert.ok(target.width >= 48 && target.height >= 48 && target.tabIndex >= 0);
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const a = targets[i], b = targets[j];
    assert.ok(!(a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1), `Overlapping village touch targets: ${a.label} / ${b.label}`);
  }
  await snapshot(page, '320-large-overview');
  const cluster = page.locator('.village-cluster[aria-hidden="false"]').first(); await cluster.click();
  assert.deepEqual(await page.locator('.guide-village-order strong').allTextContents(), loop.orderedVillageIds.map(id => names[id]));
  await snapshot(page, '320-large-village-group-order'); await close(page);
  assert.equal(await cluster.evaluate(element => element === document.activeElement), true);
  await cluster.click();
  await page.locator('.guide-village-order').getByRole('button', { name: /龙宫村/ }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('.map-card[data-map-scope="village"][data-selected-village-id="longgong"]').waitFor();
  await page.waitForFunction(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    const rect = active.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && getComputedStyle(active).visibility !== 'hidden';
  });
  const selectionFocus = await page.evaluate(() => ({ tag: document.activeElement.tagName, className: document.activeElement.className, label: document.activeElement.getAttribute('aria-label') }));
  return { targets, originalCoordinatesUnmoved: true, allFiveVillagesRepresented: true, groupOpensExistingOrderSheet: true, focusAfterSelectingDifferentVillage: selectionFocus };
});

await check('Real village POI map, one-click introduction, Escape focus and same camera after close', async () => {
  assert.ok(getMappableVillagePois(richest).length >= 1, 'At least one real village must have a verified coordinate POI');
  const page = await pageFor(); await load(page); await readyMap(page); await select(page, richest);
  await page.locator('.poi-marker').first().waitFor();
  await snapshot(page, '390-village-pois');
  await openList(page); await snapshot(page, '390-village-poi-list'); await close(page);
  const cameraBefore = await camera(page);
  const marker = page.locator('.poi-marker:not(.poi-cluster)').first();
  assert.ok(await marker.count(), 'At least one directly selectable POI should be visible');
  const id = await marker.getAttribute('data-poi-id'); await marker.click();
  await page.locator(`.poi-introduction[data-poi-id="${id}"]`).waitFor();
  assert.equal(await page.locator('dialog[open]').count(), 1);
  assert.equal(await page.evaluate(() => window.__guideSpeechCalls), 0);
  await snapshot(page, '390-poi-introduction');
  await page.keyboard.press('Escape'); await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.deepEqual(await camera(page), cameraBefore);
  assert.equal(await marker.evaluate(element => element === document.activeElement), true, `Focus after map intro close: ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 300))}`);
  await snapshot(page, '390-after-close');
  return { villageId: richest, realPoiId: id, verifiedPoiCount: getVillagePois(richest).length, verifiedCoordinateCount: getMappableVillagePois(richest).length, multiCoordinateLimitation: getMappableVillagePois(richest).length < 2 ? 'Only one located POI in the best-covered real village; the multi-POI list contains additional coordinate-pending records. No invented markers or multi-marker screenshot.' : null, cameraBefore, cameraAfter: await camera(page) };
});

await check('Controlled dense POI fixture clusters one touch target and resolves a named selection', async () => {
  const seed = getMappableVillagePois(richest)[0]; assert.ok(seed);
  const catalog = [1, 2].map(index => ({ ...seed, id: `test-dense-${index}`, officialName: `触控测试点${index}`, summary: '仅用于自动化验证密集点触控与列表选择，不作为地理或文化资料。' }));
  const page = await pageFor(390, 844, { poiOverride: catalog }); await load(page); await readyMap(page); await select(page, richest);
  await page.locator('.poi-cluster').waitFor(); assert.equal(await page.locator('.poi-marker').count(), 1);
  const group = page.locator('.poi-cluster');
  const hitSize = await group.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
  assert.ok(hitSize.width >= 48 && hitSize.height >= 48);
  await group.click(); assert.equal(await page.locator('.guide-poi-list li').count(), 2);
  await page.locator('.guide-poi-list').getByRole('button', { name: /触控测试点2/ }).click();
  await page.locator('.poi-introduction[data-poi-id="test-dense-2"]').waitFor();
  assert.equal(await page.locator('dialog[open]').count(), 1);
  return { fixtureOnly: true, duplicateCoordinatesUnmoved: true, clusterHitSize: hitSize, selectedId: 'test-dense-2', noFixtureScreenshotUsedAsGeographicEvidence: true };
});

await check('All five villages retain every verified POI in the same-source readable list', async () => {
  const page = await pageFor(); await load(page); await readyMap(page);
  const coverage = [];
  for (const id of Object.keys(names)) {
    await select(page, id); await openList(page);
    const records = getVillagePois(id);
    assert.deepEqual(await page.locator('.guide-poi-list strong').allTextContents(), records.map(poi => poi.officialName));
    for (const poi of records) {
      await page.locator('.guide-poi-list').getByRole('button', { name: new RegExp(poi.officialName) }).click();
      await page.locator(`.poi-introduction[data-poi-id="${poi.id}"]`).waitFor();
      assert.equal(await page.locator('.poi-summary').innerText(), poi.summary);
      assert.match(await page.locator('.guide-meta').innerText(), new RegExp(names[id]));
      if (!poi.normalizedCoordinate) await page.getByText('位置待核验，暂未在地图落点。', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '导航去这里', exact: true }).count(), 0);
      await page.getByRole('button', { name: '查看本村其他景点', exact: true }).click();
    }
    await close(page);
    coverage.push({ villageId: id, introductionsOpened: records.length, mappedCoordinateRecords: getMappableVillagePois(id).length });
  }
  assert.equal(await page.evaluate(() => window.__guideSpeechCalls), 0);
  return { coverage, allIntroductionsOpened: coverage.reduce((sum, item) => sum + item.introductionsOpened, 0), automaticSpeech: false };
});

await check('Incomplete loop keeps proven segments but never invents closure or total distance', async () => {
  const partial = { ...loop, closureStatus: 'blocked', geometryStatus: 'incomplete', geometry: null, distanceMeters: null, segments: loop.segments.slice(0, -1), orderedSegmentIds: loop.orderedSegmentIds.slice(0, -1), audit: { ...loop.audit, topologyVerified: false, coordinateContinuityVerified: false } };
  const page = await pageFor(390, 844, { loopOverride: partial }); await load(page); await readyMap(page);
  await page.getByText('环线闭合路段待核验', { exact: true }).waitFor();
  assert.doesNotMatch(await page.locator('.town-village-copy').innerText(), /143\.9|km/);
  await page.getByRole('button', { name: '环线与游览顺序', exact: true }).click();
  assert.doesNotMatch(await page.locator('.town-guide-content').innerText(), /143\.9 公里/);
  await close(page); await snapshot(page, '390-incomplete-loop', 'fault-injected-missing-existing-return-segment');
  return { missingSegmentId: loop.segments.at(-1).id, remainingProvenSegments: partial.segments.length, noInventedClosingLine: true, noCompleteDistance: true };
});

await check('Keyboard trap, mobile Back, rapid village selection and overview restoration', async () => {
  const page = await pageFor(); await load(page); await readyMap(page); await select(page, richest);
  const before = await camera(page); await introFromList(page);
  for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); assert.equal(await page.locator('dialog[open]').evaluate(element => element.contains(document.activeElement)), true, `Tab ${i}: ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 300))}`); }
  await page.goBack(); await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).hash, '#/town'); assert.deepEqual(await camera(page), before);
  assert.equal(await page.getByRole('button', { name: '景点清单', exact: true }).evaluate(element => element === document.activeElement), true);
  for (const id of ['qingtan', 'longgong', 'ruoao']) await select(page, id);
  await openList(page);
  assert.equal(await page.locator('dialog[open] h2').innerText(), '箬岙村景点');
  const lastIds = await page.locator('.guide-poi-list strong').allTextContents();
  assert.deepEqual(lastIds, getVillagePois('ruoao').map(poi => poi.officialName));
  await close(page);
  await page.getByRole('button', { name: '查看完整环线', exact: true }).click();
  await page.locator('.map-card[data-map-scope="loop"]').waitFor();
  return { backKeptHash: '#/town', lastVillageNames: lastIds, overviewCamera: await camera(page) };
});

await check('Forward to a stale guide entry then reopening still lets Back close the guide', async () => {
  const page = await pageFor(); await load(page); await readyMap(page); await select(page, richest);
  const before = await camera(page);
  await openList(page); await close(page);
  await page.goForward(); await page.waitForTimeout(100);
  assert.equal(new URL(page.url()).hash, '#/town');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await openList(page); await page.goBack(); await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.deepEqual(await camera(page), before);
  assert.equal(new URL(page.url()).hash, '#/town');
  return { staleSameUrlEntryReused: true, oneBackClosesReopenedGuide: true, cameraRetained: true };
});

await check('Map gesture survives candidate navigation and whole-loop action explicitly refits', async () => {
  const page = await pageFor(); await load(page); await readyMap(page);
  const original = await camera(page), box = await page.locator('.maplibregl-canvas').boundingBox();
  const y = box.y + box.height * .48, x = box.x + box.width * .45;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 42, y + 20, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(350); const dragged = await camera(page);
  assert.notDeepEqual(dragged, original, 'A real map gesture must change the observed camera');
  const rail = page.getByRole('navigation', { name: '主要导航' });
  await rail.getByRole('button', { name: '候车', exact: true }).click(); await page.locator('.screen-ride').waitFor();
  await rail.getByRole('button', { name: '古镇', exact: true }).click(); await readyMap(page);
  assert.deepEqual(await camera(page), dragged);
  await page.getByRole('button', { name: '查看完整环线', exact: true }).click(); await page.waitForTimeout(180);
  const refitted = await camera(page); assert.notDeepEqual(refitted, dragged);
  return { original, dragged, afterReturn: dragged, refitted };
});

await check('POI browsing never overwrites research endpoints or saved return plan', async () => {
  const page = await pageFor(); await load(page); await readyMap(page); await select(page, 'xujiashan');
  await page.getByRole('button', { name: '查看道路方案', exact: true }).click(); await page.locator('.screen-route').waitFor();
  await page.locator('.detail-stops').getByRole('button', { name: /龙宫村/ }).click();
  await page.locator('.notch-action button').click(); await page.locator('.screen-return').waitFor();
  await page.locator('.notch-action button').click();
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('xiangxu.journey.v1') || 'null')?.savedPlan);
  const toast = page.getByRole('button', { name: '关闭提示', exact: true }); if (await toast.isVisible()) await toast.click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('xiangxu.journey.v1')));
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '古镇', exact: true }).click(); await readyMap(page);
  assert.equal(await page.locator('.map-card').getAttribute('data-map-scope'), 'route');
  await select(page, richest); await introFromList(page); await close(page);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('xiangxu.journey.v1')));
  assert.deepEqual(after.savedPlan, saved.savedPlan);
  for (const field of ['originVillageId', 'destinationVillageId', 'direction']) assert.equal(after.journey[field], saved.journey[field]);
  await page.getByRole('button', { name: '查看完整环线', exact: true }).click(); await page.locator('.map-card[data-map-scope="loop"]').waitFor();
  return { savedPlan: saved.savedPlan, savedPlanUnchanged: true, explicitOverviewAvailableDuringResearch: true };
});

await check('No WebGL and loop 404 still preserve village text introductions', async () => {
  const page = await pageFor(320, 568, { size: 'L', webgl: false, loopFailure: true }); await load(page);
  await page.getByText('地图暂未加载', { exact: true }).waitFor(); await bounds(page);
  await page.getByRole('button', { name: '环线与游览顺序', exact: true }).click();
  await page.getByRole('button', { name: '重新加载环线', exact: true }).waitFor(); await close(page);
  await page.getByRole('combobox', { name: '选择古村', exact: true }).selectOption(richest);
  const poi = await introFromList(page); await checkDialog(page); await snapshot(page, '320-map-failure-intro', 'injected-webgl-and-http-failure-real-poi'); await close(page);
  return { realPoiId: poi.id, noWebGL: true, loopHttpStatus: 404, textStillAvailable: true };
});

await check('Null coordinates and missing photo remain readable without false map markers', async () => {
  const seed = getVillagePois(richest)[0]; assert.ok(seed);
  const injected = { ...seed, normalizedCoordinate: null, originalCoordinate: null, coordinateSources: [], verificationStatus: { ...seed.verificationStatus, coordinates: 'pending' }, image: { src: '/test-poi-missing-image.png', author: 'Test fixture', alt: 'Fault injection image', license: 'test-only', subject: seed.officialName } };
  const page = await pageFor(390, 844, { poiOverride: [injected] });
  await page.route('**/test-poi-missing-image.png', route => route.fulfill({ status: 404, body: '' }));
  await load(page); await readyMap(page); await select(page, richest);
  assert.equal(await page.locator('.poi-marker').count(), 0);
  await introFromList(page, injected); await page.getByText('图片暂未加载，文字介绍仍可阅读。', { exact: true }).waitFor();
  assert.match(await page.locator('dialog[open]').innerText(), /位置待核验，暂未在地图落点/);
  assert.equal(await page.locator('.poi-summary').innerText(), seed.summary);
  await snapshot(page, '390-null-coordinate-image-failure', 'fault-injected-catalog-not-geographic-evidence');
  return { sourcePoiId: seed.id, faultInjected: ['null coordinate', 'broken image'], noFabricatedMarker: true };
});

await check('Empty POI catalog has honest text and does not affect full road loop', async () => {
  const page = await pageFor(390, 844, { poiOverride: [] }); await load(page); await readyMap(page); await openList(page);
  await page.locator('.guide-empty').waitFor(); assert.equal(await page.locator('.guide-poi-list li').count(), 0); await checkDialog(page); await close(page);
  assert.equal(await page.locator('.map-card').getAttribute('data-map-scope'), 'loop');
  return { injectedEmptyCatalog: true, noInventedPoi: true };
});

await check('Seven unaffected pages preserve v2.2.2 geometry, colors, typography and five-item rail', async () => {
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
  const server = createServer(async (request, response) => {
    try {
      const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html', file = resolve(baselineRoot, name);
      if (!file.startsWith(baselineRoot + sep)) throw new Error('Invalid path');
      const content = await readFile(file); response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  try {
    const baselineUrl = `http://127.0.0.1:${server.address().port}`;
    assert.equal(JSON.parse(await readFile(resolve(baselineRoot, 'version.json'), 'utf8')).version, '2.2.2');
    const oldPage = await pageFor(), currentPage = await pageFor();
    await load(oldPage, 'ride', baselineUrl); await load(currentPage, 'ride');
    const selectors = ['.phone', '.app-topbar', '.trip-header', '.hero-title', '.route-identity', '.sculpt-frame', '.teal-content', '.notch-action button', '.terracotta', '.groove-rail'];
    const evidence = [];
    async function style(page) {
      return page.evaluate(selectors => Object.fromEntries(selectors.map(selector => {
        const element = document.querySelector(selector), rect = element.getBoundingClientRect(), css = getComputedStyle(element);
        return [selector, { x: Math.round(rect.x * 100) / 100, y: Math.round(rect.y * 100) / 100, width: Math.round(rect.width * 100) / 100, height: Math.round(rect.height * 100) / 100, fontSize: css.fontSize, fontFamily: css.fontFamily, color: css.color, background: css.backgroundColor, radius: css.borderRadius }];
      })), selectors);
    }
    for (const screen of ['ride', 'return', 'scan', 'route', 'ticket', 'help', 'delay']) {
      for (const page of [oldPage, currentPage]) { await page.evaluate(screen => location.hash = `/${screen}`, screen); await page.locator(`.mobile-main[data-screen="${screen}"]`).waitFor(); await page.waitForTimeout(100); }
      const before = await style(oldPage), after = await style(currentPage);
      assert.deepEqual(after, before, `${screen} style changed outside the town map`);
      assert.equal(await currentPage.locator('.groove-item').count(), 5);
      if (['ride', 'return', 'scan', 'help'].includes(screen)) { await snapshot(oldPage, `baseline-${screen}`, 'v2.2.2-frozen-build'); await snapshot(currentPage, `current-${screen}`); }
      evidence.push({ screen, matchingSelectors: selectors.length });
    }
    return { baselineVersion: '2.2.2', pages: evidence, noUnrelatedPageLayoutChange: true };
  } finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
});

await browser.close();
checks.push({ name: 'Uncaught JavaScript errors', status: errors.length ? 'FAIL' : 'PASS', detail: errors });
let mergedChecks = checks, mergedCaptures = captures;
if (filter) {
  try {
    const previous = JSON.parse(await readFile(`${output}/results.json`, 'utf8'));
    const latest = new Map(checks.map(check => [check.name, check]));
    mergedChecks = previous.checks.map(check => latest.get(check.name) || check);
    mergedChecks.push(...checks.filter(check => !previous.checks.some(old => old.name === check.name)));
    const paths = new Map((previous.captures || []).map(capture => [capture.path, capture])); captures.forEach(capture => paths.set(capture.path, capture)); mergedCaptures = [...paths.values()];
  } catch { /* First filtered run */ }
}
await writeFile(`${output}/results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), base, browser: 'Installed desktop Microsoft Edge / Chromium; phone viewport emulation, not physical iOS/Android', isolatedProfile: true, lastRunFilter: process.env.TOWN_GUIDE_FILTER || null, catalogCounts: Object.fromEntries(Object.keys(names).map(id => [id, { verified: getVillagePois(id).length, mappable: getMappableVillagePois(id).length }])), checks: mergedChecks, captures: mergedCaptures }, null, 2));
if (checks.some(check => check.status === 'FAIL')) process.exitCode = 1;
