import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = '.delivery/journey-link/after', report = `${output}/results.json`;
const filter = process.env.JOURNEY_TEST_FILTER ? new RegExp(process.env.JOURNEY_TEST_FILTER, 'i') : null;
const fixture = JSON.parse(await readFile('public/geography/route-research.json', 'utf8'));
const baseline = JSON.parse(await readFile('.delivery/journey-link/before/baseline.json', 'utf8'));
const key = 'xiangxu.journey.v1', prefsKey = 'baixi.mobile.v2';
const defaultPrefs = { size: 'L', regularSize: 'M', senior: false, favorite: false, savedReturn: null, quiet: false };
const names = [], checks = [], errors = [], captures = [], pages = new Set();
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });

async function check(name, run) {
  names.push(name); if (filter && !filter.test(name)) return;
  try { checks.push({ name, status: 'PASS', verifiedAt: new Date().toISOString(), evidence: await run() }); }
  catch (error) {
    checks.push({ name, status: 'FAIL', verifiedAt: new Date().toISOString(), detail: error.message });
    for (const [index, page] of [...pages].entries()) await page.screenshot({ path: `${output}/failure-${checks.length}-${index}.png` }).catch(() => {});
  } finally { await Promise.all([...pages].map(page => page.close())); pages.clear(); }
  console.log(`${checks.at(-1).status}: ${name}${checks.at(-1).detail ? '\n' + checks.at(-1).detail : ''}`);
  await writeFile(`${output}/progress.json`, JSON.stringify({ at: new Date().toISOString(), checks }, null, 2));
}
async function pageFor(width = 390, height = 844, { prefs = defaultPrefs, reduced = false, storage = null, failSave = false, data = undefined, offline = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, locale: 'zh-CN', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  pages.add(page); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ prefs, storage, failSave, key, prefsKey }) => {
    // Seed only a new isolated browser profile. Reloads must preserve the app's writes.
    if (!sessionStorage.getItem('journey-test-seeded')) {
      localStorage.setItem(prefsKey, JSON.stringify(prefs));
      if (storage) localStorage.setItem(key, JSON.stringify(storage));
      sessionStorage.setItem('journey-test-seeded', 'true');
    }
    if (failSave) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) {
        if (name === key) throw new DOMException('Storage unavailable for test', 'QuotaExceededError');
        return original.call(this, name, value);
      };
    }
  }, { prefs, storage, failSave, key, prefsKey });
  if (offline) await page.route('**/geography/route-research.json*', route => route.abort('internetdisconnected'));
  else if (data !== undefined) await page.route('**/geography/route-research.json*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }));
  return page;
}
async function screen(page, name) { await page.locator(`.mobile-main[data-screen="${name}"]`).waitFor(); }
async function load(page, name = 'town') {
  await page.goto(`${base}/#/${name}`); await screen(page, name); await page.evaluate(() => document.fonts.ready);
  if (name === 'town') await page.locator('.town-village-picker select').waitFor();
}
async function nav(page, label, name) { await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: label, exact: true }).click(); await screen(page, name); }
async function dismissToast(page) { const button = page.getByRole('button', { name: '关闭提示', exact: true }); if (await button.isVisible()) await button.click(); }
async function closeDialog(page) { await page.getByRole('button', { name: '关闭弹窗', exact: true }).click(); await page.locator('dialog[open]').waitFor({ state: 'detached' }); }
async function state(page) {
  return page.locator('.mobile-main').evaluate(element => ({ mode: element.dataset.journeyMode, origin: element.dataset.origin, destination: element.dataset.destination, direction: element.dataset.direction, proposal: element.dataset.routeProposal }));
}
async function stored(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), key); }
async function selectOrigin(page, origin = 'xujiashan') { await page.locator('.town-village-picker select').selectOption(origin); await page.locator('.town-route-action').click(); await screen(page, 'route'); }
async function chooseDestination(page, label = '龙宫村') { const button = page.locator('.detail-stops').getByRole('button', { name: new RegExp(label) }); await button.click(); assert.equal(await button.getAttribute('aria-pressed'), 'true'); }
async function outbound(page) {
  await load(page); await selectOrigin(page); await chooseDestination(page);
  await page.waitForFunction(() => document.querySelector('.route-chips')?.textContent.includes('41.9 km'));
  assert.deepEqual(await state(page), { mode: 'research', origin: 'xujiashan', destination: 'longgong', direction: 'outbound', proposal: 'xujiashan-longgong' });
}
async function toReturn(page) { await page.locator('.notch-action button').click(); await screen(page, 'return'); }
async function save(page) { assert.match(await page.locator('.notch-action button').innerText(), /保存研究计划/); await page.locator('.notch-action button').click(); await page.waitForFunction(key => !!JSON.parse(localStorage.getItem(key) || 'null')?.savedPlan, key); await dismissToast(page); }
async function snapshot(page, name) {
  await page.waitForTimeout(700);
  const path = `${output}/${name}.png`; await page.screenshot({ path });
  const evidence = await page.evaluate(() => {
    const rect = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; };
    return { hash: location.hash, screen: document.querySelector('.mobile-main')?.dataset.screen,
      size: document.documentElement.dataset.textSize, phone: rect('.phone'), rail: rect('.groove-rail'),
      selectedVillage: document.querySelector('.town-village-card')?.dataset.villageId || null,
      map: document.querySelector('.map-card') ? { scope: document.querySelector('.map-card').dataset.mapScope, depth: document.querySelector('.map-card').dataset.mapDepth, presentation: document.querySelector('.map-card').dataset.mapPresentation, center: document.querySelector('.map-canvas')?.dataset.mapCenter } : null,
      routeStops: [...document.querySelectorAll('.detail-stops strong')].map(e => e.textContent),
      primaryAction: document.querySelector('.notch-action button')?.textContent || null,
      dialog: document.querySelector('dialog[open]')?.textContent || null,
      font: getComputedStyle(document.querySelector('.phone')).fontFamily,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  captures.push({ path, at: new Date().toISOString(), viewport: page.viewportSize(), evidence }); return evidence;
}
async function bounds(page, selectors = ['.notch-action button', '.groove-item']) {
  const issues = await page.evaluate(selectors => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('horizontal page overflow');
    for (const selector of selectors) for (const element of document.querySelectorAll(selector)) {
      const r = element.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) issues.push(`outside viewport: ${selector}`);
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!hit || !element.contains(hit)) issues.push(`covered center: ${selector}`);
    }
    return issues;
  }, selectors);
  assert.deepEqual(issues, []); return issues;
}

await check('Source design constraints preserve CSS, SVG artwork, groove motion and default map scene', async () => {
  const changed = execFileSync('git', ['diff', '--name-only', baseline.commit], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  const forbidden = changed.filter(path => path.endsWith('.css') || /(?:GrooveNavigation|TransitArt|SheetPanel|useScreenMotion|GeographyMap)\.tsx?$/.test(path) || path === 'src/main.tsx');
  assert.deepEqual(forbidden, []);
  return { baseline: baseline.commit, changed, forbidden, reviewScope: 'Only data links and reused content slots may change; screenshots remain separately reviewable.' };
});

for (const [width, height] of [[390, 844], [320, 568]]) {
  await check(`${width}px L complete journey uses independent 41.9 / 58.2 km routes and restores saved return`, async () => {
    const page = await pageFor(width, height); await outbound(page); await page.waitForTimeout(650);
    assert.equal(await page.locator('.detail-stops button').count(), 4);
    assert.equal(await page.locator('.detail-stops button[aria-pressed=true]').count(), 1);
    await bounds(page); await snapshot(page, `${width}x${height}-L-research-route`);
    await toReturn(page); await page.waitForFunction(() => document.querySelector('.return-stops')?.textContent.includes('58.2 km'));
    assert.deepEqual(await state(page), { mode: 'research', origin: 'xujiashan', destination: 'longgong', direction: 'return', proposal: 'longgong-xujiashan' });
    assert.match(await page.locator('.return-title').textContent(), /龙宫村.*许家山村/s);
    assert.equal(await page.getByRole('group', { name: '选择返程班次', exact: true }).count(), 0);
    assert.doesNotMatch(await page.locator('.screen-return').innerText(), /17:30|18:00|18:30|约\s*35\s*分钟/);
    await snapshot(page, `${width}x${height}-L-research-return`); await bounds(page);
    await save(page); const saved = await stored(page);
    assert.equal(saved.savedPlan.routeProposalId, 'longgong-xujiashan'); assert.equal(saved.savedPlan.dataVersion, fixture.version);
    assert.equal(saved.savedPlan.operatingStatus, 'research-not-confirmed'); assert.ok(Number.isFinite(Date.parse(saved.savedPlan.savedAt)));
    await page.locator('.notch-action button').click(); await page.getByRole('dialog', { name: '本地研究计划' }).waitFor();
    const text = await page.getByRole('dialog').innerText();
    assert.match(text, /龙宫村.*许家山村/s); assert.ok(text.includes(fixture.version)); assert.match(text, /保存时间/);
    await snapshot(page, `${width}x${height}-L-saved-research-dialog`); await closeDialog(page);
    assert.equal(await page.locator('.notch-action button').evaluate(el => el === document.activeElement), true, 'saved dialog restores its trigger focus');
    await page.reload(); await screen(page, 'return'); await page.waitForFunction(() => document.querySelector('.return-stops')?.textContent.includes('58.2 km'));
    assert.equal((await state(page)).proposal, 'longgong-xujiashan'); assert.equal((await stored(page)).savedPlan.savedAt, saved.savedPlan.savedAt);
    assert.match(await page.locator('.notch-action button').innerText(), /查看本地计划/);
    await page.locator('.notch-action button').click(); assert.match(await page.locator('.saved-card').innerText(), /龙宫村.*许家山村/s); await closeDialog(page);
    return { viewport: { width, height }, outboundKm: 41.9, returnKm: 58.2, savedPlan: saved.savedPlan, focusRestored: true };
  });
}

await check('Changing village clears destination and does not silently choose one; existing return entry carries the village', async () => {
  const page = await pageFor(390, 844, { reduced: true }); await outbound(page); await nav(page, '古镇', 'town');
  await page.locator('.town-village-picker select').selectOption('qingtan');
  let current = await state(page); assert.equal(current.origin, 'qingtan'); assert.equal(current.destination, ''); assert.equal(current.proposal, '');
  await page.locator('.town-return-action').click(); await screen(page, 'return');
  current = await state(page); assert.equal(current.origin, 'qingtan'); assert.equal(current.destination, ''); assert.equal(current.direction, 'return');
  assert.match(await page.locator('.notch-action button').innerText(), /先选研究区间/);
  await page.locator('.notch-action button').click(); await screen(page, 'route');
  assert.equal(await page.locator('.detail-stops button[aria-pressed=true]').count(), 0);
  assert.equal(await page.locator('.detail-stops button').count(), 4);
  assert.equal(await page.locator('.detail-stops button').filter({ hasText: '清潭村' }).count(), 0);
  return current;
});

await check('Existing font, favorite, motion and 18:00 demo return persist independently of a research plan', async () => {
  const prefs = { ...defaultPrefs, size: 'S', favorite: true, savedReturn: '18:00', quiet: true };
  const page = await pageFor(390, 844, { prefs, reduced: true }); await load(page, 'return');
  assert.equal(await page.locator('.hero-title').innerText(), '18:00'); await page.locator('.notch-action button').click();
  assert.match(await page.locator('.saved-card').innerText(), /18:00.*演示班次/s); await closeDialog(page);
  await outbound(page); await toReturn(page); await save(page);
  const storage = await stored(page); assert.deepEqual(storage.legacyDemoReturn, { kind: 'demo-return', time: '18:00' });
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefsKey), prefs);
  await nav(page, '候车', 'ride'); await page.locator('.route-preview').click(); await screen(page, 'route');
  assert.equal((await state(page)).mode, 'demo'); await nav(page, '返程', 'return');
  assert.equal(await page.locator('.hero-title').innerText(), '18:00');
  return { preservedPrefs: prefs, legacyDemoReturn: storage.legacyDemoReturn, researchPlanPreserved: !!(await stored(page)).savedPlan };
});

await check('Network failure keeps both endpoint choices usable and saves only a data-unavailable intention', async () => {
  const page = await pageFor(320, 568, { reduced: true, offline: true }); await load(page); await selectOrigin(page); await chooseDestination(page);
  await page.getByRole('button', { name: '重试道路研究数据', exact: true }).waitFor();
  assert.equal((await state(page)).proposal, ''); assert.match(await page.locator('.route-chips').innerText(), /资料暂不可用/);
  assert.doesNotMatch(await page.locator('.screen-route').innerText(), /暂无路径/);
  await toReturn(page); assert.match(await page.locator('.return-stops').innerText(), /道路资料暂不可用/);
  assert.doesNotMatch(await page.locator('.return-stops').innerText(), /暂无路径/);
  await save(page); const storage = await stored(page);
  assert.equal(storage.savedPlan.routeStatus, 'data-unavailable'); assert.equal(storage.savedPlan.routeProposalId, null); assert.equal(storage.savedPlan.dataVersion, null);
  await page.locator('.notch-action button').click(); assert.match(await page.getByRole('dialog').innerText(), /未载入，待核验/);
  await snapshot(page, '320x568-L-offline-saved-dialog');
  return storage.savedPlan;
});

for (const kind of ['missing reverse', 'explicit no path']) {
  await check(`A ${kind} never reverses outbound geometry or invents its distance`, async () => {
    const data = structuredClone(fixture), reverse = data.routes.find(route => route.id === 'longgong-xujiashan');
    if (kind === 'missing reverse') data.routes = data.routes.filter(route => route !== reverse);
    else Object.assign(reverse, { geometryStatus: 'unavailable', distanceMeters: null, coordinates: null, nodeIds: [], wayIds: [], unavailableReason: 'Test fixture: no directed path' });
    data.coverage.successfulRoutes -= 1;
    const page = await pageFor(390, 844, { reduced: true, data }); await outbound(page); await toReturn(page);
    assert.match(await page.locator('.return-stops').innerText(), /暂无路径/);
    assert.doesNotMatch(await page.locator('.return-stops').innerText(), /41\.9|58\.2/);
    assert.equal((await state(page)).proposal, kind === 'missing reverse' ? '' : 'longgong-xujiashan');
    await save(page); const plan = (await stored(page)).savedPlan; assert.equal(plan.routeStatus, 'unavailable');
    assert.notEqual(plan.routeProposalId, 'xujiashan-longgong');
    await nav(page, '古镇', 'town'); await page.locator('.map-card').waitFor();
    assert.equal(await page.locator('.map-card').getAttribute('data-map-scope'), 'village', 'no fake route scope');
    return plan;
  });
}

await check('Storage write failure never shows saved success or creates a plan', async () => {
  const page = await pageFor(390, 844, { reduced: true, failSave: true }); await outbound(page); await toReturn(page);
  await page.locator('.notch-action button').click();
  await page.getByText('本机未能保存计划，当前选择仅在本次打开期间保留。', { exact: true }).waitFor();
  assert.equal(await stored(page), null); assert.match(await page.locator('.notch-action button').innerText(), /保存研究计划/);
  assert.equal(await page.getByText('研究计划已保存到本机，站点与班次仍待核验。', { exact: true }).count(), 0);
  await snapshot(page, '390x844-L-storage-failure'); return { savedPlan: null, reportsFailure: true };
});

await check('Existing online plan stays viewable after network failure and failed removal preserves every saved field', async () => {
  const page = await pageFor(390, 844, { reduced: true }); await outbound(page); await toReturn(page); await save(page);
  const original = await stored(page), originalRaw = await page.evaluate(key => localStorage.getItem(key), key);
  await page.route('**/geography/route-research.json*', route => route.abort('internetdisconnected'));
  await page.reload(); await screen(page, 'return'); await page.getByRole('button', { name: '重试道路研究数据', exact: true }).waitFor();
  assert.match(await page.locator('.return-stops').innerText(), /道路资料暂不可用/);
  assert.equal(await page.locator('.notch-action button').innerText(), '查看本地计划');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), originalRaw);
  await page.locator('.notch-action button').click(); await page.getByRole('dialog', { name: '本地研究计划' }).waitFor();
  assert.match(await page.locator('.saved-card').innerText(), /龙宫村.*许家山村/s);
  assert.ok((await page.getByRole('dialog').innerText()).includes(original.savedPlan.dataVersion));
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), originalRaw, 'viewing an offline plan cannot overwrite its snapshot');
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('Removal rejected for test', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, key);
  await page.getByRole('dialog').getByRole('button', { name: '移除本地计划', exact: true }).click();
  await page.getByRole('dialog').getByText('未能移除本地计划，请稍后重试。', { exact: true }).waitFor();
  assert.equal(await page.locator('dialog[open]').count(), 1);
  assert.deepEqual((await stored(page)).savedPlan, original.savedPlan);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), originalRaw);
  await snapshot(page, '390x844-L-existing-plan-offline-removal-failure'); await closeDialog(page);
  assert.equal(await page.locator('.notch-action button').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('.notch-action button').innerText(), '查看本地计划');
  await page.locator('.notch-action button').click();
  const reopened = await page.getByRole('dialog').innerText(); assert.ok(reopened.includes(fixture.version)); assert.match(reopened, /保存时间/);
  assert.deepEqual((await stored(page)).savedPlan, original.savedPlan);
  return { preservedPlan: original.savedPlan, rawStorageUnchanged: true, offlineViewOpensWithoutSaving: true, failedRemovalKeepsDialogAndPlan: true, focusRestored: true };
});

await check('Changed data version warns without silently replacing the stored snapshot', async () => {
  const page = await pageFor(390, 844, { reduced: true }); await outbound(page); await toReturn(page); await save(page);
  const original = await stored(page), newer = structuredClone(fixture); newer.version += '-test-update';
  await page.route('**/geography/route-research.json*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(newer) }));
  await page.reload(); await screen(page, 'return'); await page.getByText('旧计划待复核', { exact: true }).waitFor();
  assert.deepEqual((await stored(page)).savedPlan, original.savedPlan);
  assert.equal(await page.locator('.notch-action button').innerText(), '更新研究计划');
  await page.locator('.route-identity').click(); await screen(page, 'route'); assert.match(await page.locator('.route-chips').innerText(), /资料有更新/);
  await snapshot(page, '390x844-L-version-warning');
  return { currentVersion: newer.version, savedVersion: original.savedPlan.dataVersion, savedAtUnchanged: true };
});

for (const [width, height] of [[390, 844], [320, 568]]) {
  await check(`${width}px senior return reuses simple controls with research endpoints and no fake departure`, async () => {
    const page = await pageFor(width, height, { reduced: true }); await outbound(page); await toReturn(page);
    await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('switch', { name: '老年人模式', exact: true }).click();
    await page.locator('.senior-tasks button').first().waitFor(); await page.locator('dialog[open]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.senior-tasks button').count(), 4); await page.getByRole('button', { name: '看返程', exact: true }).click();
    await page.locator('.senior-return').waitFor();
    const text = await page.locator('.senior-return-card').innerText(); assert.match(text, /龙宫村.*许家山村/s); assert.match(text, /待核验/); assert.doesNotMatch(text, /17:30|18:00|18:30/);
    assert.equal(await page.locator('.senior-secondary').isDisabled(), true);
    await page.locator('.senior-primary').click(); await dismissToast(page); assert.ok((await stored(page)).savedPlan);
    await snapshot(page, `${width}x${height}-L-senior-research-return`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.getByRole('button', { name: '返回首页', exact: true }).click(); await page.getByRole('button', { name: '找人帮忙', exact: true }).click();
    assert.match(await page.locator('.senior-help-message').innerText(), /龙宫村.*许家山村.*核实车站和班次/s);
    return { viewport: { width, height }, originalActionCount: 4, research: text };
  });
}

for (const [width, height] of [[390, 844], [320, 568]]) {
  await check(`${width}px original town, demo route and return still match baseline frames`, async () => {
    const page = await pageFor(width, height); await load(page); await page.locator('.village-pin[aria-pressed=true]').waitFor({ timeout: 30000 });
    const results = [];
    for (const name of ['town', 'route', 'return']) {
      if (name !== 'town') await load(page, name);
      const actual = await snapshot(page, `${width}x${height}-L-${name}`);
      const before = baseline.captures.find(item => item.name === name && item.viewport.width === width);
      for (const shape of ['phone', 'rail']) for (const dimension of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before.state[shape][dimension] - actual[shape][dimension]) < 1.1, `${name} ${shape}.${dimension}: ${before.state[shape][dimension]} -> ${actual[shape][dimension]}`);
      assert.equal(actual.horizontalOverflow, false);
      assert.equal(await page.getByRole('navigation', { name: '主要导航' }).getByRole('button').count(), 5);
      assert.equal(await page.locator('.phone .font-options').count(), 0);
      if (name === 'town') {
        assert.equal(actual.selectedVillage, 'xujiashan'); assert.deepEqual({ scope: actual.map.scope, depth: actual.map.depth, presentation: actual.map.presentation }, { scope: 'village', depth: 'flat', presentation: 'scene' });
        assert.equal(await page.locator('.town-route-action').innerText(), '查看道路方案');
        assert.equal(await page.locator('.town-scene button').count(), 8, 'five map markers and three reused actions only');
      } else if (name === 'route') assert.deepEqual(actual.routeStops, ['溪畔站', '青云路站', '东湖站', '城南客运站']);
      else { await page.locator('.notch-action button').click(); await dismissToast(page); await page.locator('.notch-action button').click(); await snapshot(page, `${width}x${height}-L-saved-return-dialog`); await closeDialog(page); }
      results.push({ name, before: before.path, after: captures.find(item => item.path.endsWith(`${width}x${height}-L-${name}.png`)).path, phone: actual.phone, rail: actual.rail });
    }
    return results;
  });
}

await check('Desktop ride keeps original preview frame and original unaffected pages keep their entry slots', async () => {
  const page = await pageFor(1440, 900, { prefs: { ...defaultPrefs, size: 'M' } }); await load(page, 'ride');
  const actual = await snapshot(page, '1440x900-M-ride'); const before = baseline.captures.find(item => item.viewport.width === 1440);
  for (const shape of ['phone', 'rail']) for (const dimension of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before.state[shape][dimension] - actual[shape][dimension]) < 1.1, `${shape}.${dimension}`);
  const pageSlots = {};
  for (const name of ['ride', 'scan', 'ticket', 'help', 'delay']) {
    await load(page, name); await page.waitForTimeout(550);
    pageSlots[name] = { actions: await page.locator('.notch-action button').count(), nav: await page.getByRole('navigation', { name: '主要导航' }).getByRole('button').count(), outsideFontControls: await page.locator('.phone .font-options').count() };
    assert.deepEqual(pageSlots[name], { actions: 1, nav: 5, outsideFontControls: 0 });
  }
  return { before: before.path, after: `${output}/1440x900-M-ride.png`, pageSlots };
});

checks.push({ name: 'No uncaught JavaScript errors', status: errors.length ? 'FAIL' : 'PASS', verifiedAt: new Date().toISOString(), evidence: errors }); names.push('No uncaught JavaScript errors');
await browser.close();
let merged = checks, allCaptures = captures;
if (filter) {
  try {
    const previous = JSON.parse(await readFile(report, 'utf8'));
    const rerun = new Map(checks.map(item => [item.name, item]));
    merged = previous.checks.filter(item => names.includes(item.name)).map(item => rerun.get(item.name) || { ...item, verifiedAt: item.verifiedAt || previous.at });
    merged.push(...checks.filter(item => !merged.some(prior => prior.name === item.name)));
    allCaptures = previous.captures.filter(item => !captures.some(current => current.path === item.path)).concat(captures);
  } catch { /* A filtered first run is valid independent evidence. */ }
}
await writeFile(report, JSON.stringify({ at: new Date().toISOString(), base, baselineCommit: baseline.commit, isolatedBrowserProfile: true, lastRun: { filter: process.env.JOURNEY_TEST_FILTER || null, checks: checks.map(item => item.name) }, checks: merged, captures: allCaptures }, null, 2));
if (checks.some(item => item.status === 'FAIL')) process.exitCode = 1;
