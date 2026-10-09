import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Use an isolated browser profile: never change preferences in the user's open demo.
const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = 'docs/town-scene-screenshots';
const report = 'docs/town-scene-results.json';
const filter = process.env.TOWN_SCENE_TEST_FILTER ? new RegExp(process.env.TOWN_SCENE_TEST_FILTER, 'i') : null;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const checks = [], checkNames = [], errors = [], pages = new Set();
async function check(name, run) {
  checkNames.push(name);
  if (filter && !filter.test(name)) return;
  try { const evidence = await run(); checks.push({ name, status: 'PASS', ...(evidence ? { evidence } : {}) }); }
  catch (error) { checks.push({ name, status: 'FAIL', detail: error.message }); }
  finally { await Promise.all([...pages].map(page => page.close())); pages.clear(); }
  console.log(`${checks.at(-1).status}: ${name}`);
}
async function newPage(width = 390, height = 844, reducedMotion = 'no-preference') {
  const page = await browser.newPage({ viewport: { width, height }, locale: 'zh-CN', reducedMotion });
  page.setDefaultTimeout(12000); pages.add(page);
  page.on('pageerror', error => errors.push(error.message));
  return page;
}
async function load(page, screen = 'ride') {
  await page.goto(`${base}/#/${screen}`); await page.locator('.phone').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
const rail = page => page.getByRole('navigation', { name: '主要导航' });
const nav = (page, name) => rail(page).getByRole('button', { name, exact: true }).click();
async function readyMap(page) {
  await page.locator('.town-scene .village-pin[aria-pressed=true]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => !!document.querySelector('.town-scene .map-canvas')?.dataset.mapCenter);
}
async function settleNav(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('.groove-item[aria-current=page]');
    const disc = document.querySelector('.groove-disc');
    if (!button || !disc) return false;
    const a = button.getBoundingClientRect(), b = disc.getBoundingClientRect();
    return Math.abs(a.top + a.height / 2 - b.top - b.height / 2) < .75;
  });
}
async function closeToast(page) {
  const button = page.getByRole('button', { name: '关闭提示', exact: true });
  if (await button.count()) await button.click();
}

for (const width of [390, 320]) {
await check(`${width}px groove follows continuously into and out of town while all five slots stay fixed`, async () => {
  const page = await newPage(width, width === 320 ? 568 : 844); await load(page); await settleNav(page);
  const evidence = [];
  for (const label of ['古镇', '候车']) {
    const samples = await page.evaluate(label => new Promise(resolve => {
      const original = document.querySelector('.groove-rail');
      const positions = () => [...document.querySelectorAll('.groove-item')].map(el => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
      const before = positions(), start = performance.now(), values = [];
      function record(now) {
        const circle = document.querySelector('.groove-disc'), path = document.querySelector('.groove-outline');
        values.push({ y: +circle.getAttribute('cy'), groove: +path.dataset.center, sameNode: original === document.querySelector('.groove-rail'), slots: positions() });
        if (now - start < 800) requestAnimationFrame(record); else resolve({ before, values });
      }
      requestAnimationFrame(record);
      [...document.querySelectorAll('.groove-item')].find(el => el.textContent.trim() === label).click();
    }), label);
    const positions = new Set(samples.values.map(value => value.y.toFixed(2))).size;
    const slotLayouts = new Set([samples.before, ...samples.values.map(value => value.slots)].map(slots => JSON.stringify(slots)));
    const travel = Math.abs(samples.values.at(-1).y - samples.values[0].y);
    const largestStep = Math.max(...samples.values.slice(1).map((value, index) => Math.abs(value.y - samples.values[index].y)));
    assert.ok(positions > 4, `${label}: only ${positions} follower positions`);
    assert.ok(largestStep < travel * .4, `${label}: follower jumps ${largestStep}px in one frame over ${travel}px travel`);
    // A compact scene may have a different fixed rail height from the transit panel.
    // This one responsive layout adjustment must never become per-frame slot motion.
    assert.ok(slotLayouts.size <= 2, `${label}: item slots follow the animated disc`);
    for (const sample of samples.values) {
      assert.ok(sample.sameNode, `${label}: navigation was remounted`);
      assert.equal(sample.y, sample.groove, `${label}: outline and disc diverged`);
    }
    await settleNav(page);
    evidence.push({ label, distinctFollowerPositions: positions, sampledFrames: samples.values.length, fixedSlotLayouts: slotLayouts.size, largestFollowerStep: largestStep });
  }
  return evidence;
});
}

await check('Village changes animate the real projected map and keep the same canvas', async () => {
  const page = await newPage(); await load(page, 'town'); await readyMap(page);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const canvas = document.querySelector('.maplibregl-canvas');
    window.__cameraSamples = new Promise(resolve => {
      const start = performance.now(), frames = [];
      function record(now) {
        const marker = document.querySelector('.village-pin[data-village-id=qingtan]');
        const rect = marker.getBoundingClientRect();
        frames.push({ at: now - start, x: rect.x, y: rect.y, transform: marker.style.transform, sameCanvas: canvas === document.querySelector('.maplibregl-canvas') });
        if (now - start < 1100) requestAnimationFrame(record); else resolve(frames);
      }
      requestAnimationFrame(record);
    });
  });
  await page.getByLabel('选择古村', { exact: true }).selectOption('qingtan');
  const samples = await page.evaluate(() => window.__cameraSamples);
  const transforms = new Set(samples.map(sample => sample.transform)).size;
  assert.ok(transforms >= 5, `map produced only ${transforms} projected positions`);
  assert.ok(samples.every(sample => sample.sameCanvas), 'selection recreated the map canvas');
  const middle = samples.filter(sample => sample.at > 100 && sample.at < 680);
  assert.ok(new Set(middle.map(sample => sample.transform)).size > 2, 'camera only changed at beginning or end');
  assert.equal(await page.locator('.town-village-card').getAttribute('data-village-id'), 'qingtan');
  const position = await page.locator('.map-canvas').getAttribute('data-map-center');
  const center = position.split(',').map(Number);
  assert.ok(Math.abs(center[0] - 121.2881886) < .00001 && Math.abs(center[1] - 29.4315601) < .00001, `unexpected geographic center ${position}`);
  await page.screenshot({ path: `${output}/390-qingtan.png` });
  return { distinctProjectedPositions: transforms, sampledFrames: samples.length, finalCenter: center };
});

await check('Rapid village selections finish at the last village without replacing map canvas', async () => {
  const page = await newPage(); await load(page, 'town'); await readyMap(page);
  await page.waitForTimeout(900);
  await page.evaluate(() => { window.__originalCanvas = document.querySelector('.maplibregl-canvas'); });
  const picker = page.getByLabel('选择古村', { exact: true });
  await picker.selectOption('longgong'); await page.waitForTimeout(140);
  await picker.selectOption('meizhitian'); await page.waitForTimeout(120);
  await picker.selectOption('ruoao');
  await page.waitForFunction(() => {
    const center = document.querySelector('.map-canvas')?.dataset.mapCenter?.split(',').map(Number);
    return center && Math.abs(center[0] - 121.4779495) < .00001 && Math.abs(center[1] - 29.184526) < .00001;
  });
  assert.ok(await page.evaluate(() => window.__originalCanvas === document.querySelector('.maplibregl-canvas')));
  assert.equal(await page.locator('.town-village-card').getAttribute('data-village-id'), 'ruoao');
  assert.equal(await page.locator('.village-pin[data-village-id=ruoao]').getAttribute('aria-pressed'), 'true');
  assert.ok(await page.locator('.village-pin[data-village-id=ruoao]').isVisible());
});

await check('Village picker, original route callback and return callback remain connected', async () => {
  const page = await newPage(390, 844, 'reduce'); await load(page, 'town'); await readyMap(page);
  const picker = page.getByLabel('选择古村', { exact: true });
  assert.equal(await picker.locator('option').count(), 5);
  for (const [id, label] of [['qingtan', '清潭村'], ['meizhitian', '梅枝田村'], ['ruoao', '箬岙村']]) {
    await picker.selectOption(id);
    assert.equal(await page.locator('.town-village-card').getAttribute('data-village-id'), id);
    assert.equal(await page.locator('.town-village-copy h3').textContent(), label);
    assert.equal(await page.locator(`.village-pin[data-village-id=${id}]`).getAttribute('aria-pressed'), 'true');
  }
  await page.getByRole('button', { name: '查看公交线路', exact: true }).click();
  await page.locator('.screen-route').waitFor();
  assert.equal(await page.locator('.detail-stops button').count(), 4);
  await nav(page, '古镇'); await readyMap(page);
  assert.equal(await page.locator('.town-village-card').getAttribute('data-village-id'), 'ruoao');
  await page.locator('.town-return-action').click(); await page.locator('.screen-return').waitFor();
  assert.equal(await page.locator('.return-stops li').count(), 6);
  await page.getByRole('button', { name: '18:00', exact: true }).click();
  await page.getByRole('button', { name: '保存这趟返程', exact: true }).click(); await closeToast(page);
  await nav(page, '古镇'); await readyMap(page);
  assert.match(await page.locator('.town-return-action').getAttribute('aria-label'), /18:00/);
  await page.getByRole('button', { name: '查看 5 路线路详情', exact: true }).click();
  await page.locator('.screen-route').waitFor();
});

for (const [width, height] of [[390, 844], [320, 568]]) {
  for (const size of ['M', 'L']) {
    await check(`${width}px ${size} scene fills the viewport and floating controls remain accessible`, async () => {
      const page = await newPage(width, height, 'reduce');
      await page.addInitScript(size => localStorage.setItem('baixi.mobile.v2', JSON.stringify({ size })), size);
      await load(page, 'town'); await readyMap(page);
      // Fonts and initial camera completion are observed before geometric assertions.
      await page.waitForTimeout(150);
      const evidence = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
        const problems = [], scene = rect('.town-scene'), map = rect('.town-scene .map-card'), canvas = rect('.maplibregl-canvas');
        const parts = ['.town-title-card', '.town-route-identity', '.town-font-controls', '.groove-rail', '.town-village-card', '.town-village-picker', '.town-return-action'];
        for (const selector of parts) {
          const box = rect(selector);
          if (box.left < scene.left - 1 || box.right > scene.right + 1 || box.top < scene.top - 1 || box.bottom > scene.bottom + 1) problems.push(`${selector} outside scene`);
        }
        for (const [a, b] of [['.town-title-card', '.town-route-identity'], ['.town-font-controls', '.groove-rail'], ['.town-village-card', '.town-village-picker'], ['.town-village-picker', '.town-return-action'], ['.town-scene-header', '.town-village-card']]) {
          if (overlaps(rect(a), rect(b))) problems.push(`${a} overlaps ${b}`);
        }
        const selected = rect('.village-pin[aria-pressed=true]');
        for (const selector of parts) if (overlaps(selected, rect(selector))) problems.push(`selected village obscured by ${selector}`);
        const actionable = [...document.querySelectorAll('.town-scene select,.town-scene button,.groove-item')];
        for (const element of actionable) {
          if (element.getAttribute('aria-hidden') === 'true' || getComputedStyle(element).visibility === 'hidden') continue;
          const box = element.getBoundingClientRect();
          const x = Math.max(0, Math.min(innerWidth - 1, box.left + box.width / 2));
          const y = Math.max(0, Math.min(innerHeight - 1, box.top + box.height / 2));
          const top = document.elementFromPoint(x, y);
          if (top && !element.contains(top)) problems.push(`unreachable center: ${element.getAttribute('aria-label') || element.textContent.trim()}`);
        }
        if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('horizontal scroll');
        if (document.documentElement.scrollHeight > innerHeight + 1) problems.push('page vertical scroll');
        const select = document.querySelector('.town-select-wrap select'), selectStyle = getComputedStyle(select);
        const text = select.options[select.selectedIndex].textContent, measure = document.createElement('canvas').getContext('2d');
        measure.font = selectStyle.font;
        if (measure.measureText(text).width > select.clientWidth - parseFloat(selectStyle.paddingLeft) - parseFloat(selectStyle.paddingRight) + 2) problems.push('selected village text truncated');
        return { problems, scene: { x: scene.x, y: scene.y, width: scene.width, height: scene.height }, map: { x: map.x, y: map.y, width: map.width, height: map.height }, canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height }, mapBorderRadius: getComputedStyle(document.querySelector('.town-scene .map-card')).borderRadius };
      });
      await page.screenshot({ path: `${output}/${width}-town-${size}.png` });
      assert.deepEqual(evidence.problems, []);
      for (const key of ['x', 'y', 'width', 'height']) {
        assert.ok(Math.abs(evidence.scene[key] - evidence.map[key]) < 1, `map does not fill scene: ${key}`);
        assert.ok(Math.abs(evidence.scene[key] - evidence.canvas[key]) < 1, `canvas does not fill scene: ${key}`);
      }
      assert.equal(evidence.mapBorderRadius, '0px');
      assert.equal(await page.locator('.town-scene .map-heading,.town-scene .map-tools,.town-scene .map-status').count(), 0);
      assert.ok(await page.getByRole('link', { name: /OpenStreetMap/ }).isVisible());
      return evidence;
    });
  }
}

await check('System and in-app reduced motion each suppress automatic scene motion', async () => {
  const evidence = [];
  for (const mode of ['system', 'preference']) {
    const page = await newPage(390, 844, mode === 'system' ? 'reduce' : 'no-preference');
    if (mode === 'preference') await page.addInitScript(() => localStorage.setItem('baixi.mobile.v2', JSON.stringify({ quiet: true })));
    await load(page, 'town'); await readyMap(page);
    assert.equal(await page.locator('.town-title-card').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.locator('.groove-symbol').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await page.getByLabel('选择古村', { exact: true }).selectOption('ruoao');
    await page.waitForTimeout(100);
    const center = await page.locator('.map-canvas').getAttribute('data-map-center');
    assert.ok(Math.abs(Number(center.split(',')[0]) - 121.4779495) < .00001, `${mode}: camera has not finished immediately`);
    evidence.push({ mode, finalCenter: center });
  }
  return evidence;
});

await check('Small, medium and large text scale scene information and persist across old pages', async () => {
  const page = await newPage(390, 844, 'reduce'); await load(page, 'town'); await readyMap(page);
  const selectors = ['.town-title-card h2', '.town-route-identity strong', '.town-village-copy h3', '.town-route-action', '.town-village-picker', '.town-select-wrap select', '.town-return-action strong', '.village-pin .pin-name', '.groove-symbol > span'];
  const evidence = [];
  for (const label of ['小字号', '中字号', '大字号']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    evidence.push(await page.evaluate(selectors => Object.fromEntries(selectors.map(selector => [selector, parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])), selectors));
  }
  for (const selector of selectors) assert.ok(evidence[0][selector] < evidence[1][selector] && evidence[1][selector] < evidence[2][selector], `${selector} does not grow at each size: ${evidence.map(value => value[selector]).join(', ')}`);
  await page.reload(); await readyMap(page);
  assert.equal(await page.getByRole('button', { name: '大字号', exact: true }).getAttribute('aria-pressed'), 'true');
  await nav(page, '候车'); await page.locator('.screen-ride').waitFor();
  assert.equal(await page.getByRole('button', { name: '大字号', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '中字号', exact: true }).click();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await nav(page, '古镇'); await readyMap(page);
  assert.equal(await page.getByRole('button', { name: '中字号', exact: true }).getAttribute('aria-pressed'), 'true');
  return evidence;
});

for (const width of [390, 320]) {
await check(`${width}px without WebGL the retry, village selector and original route action remain usable`, async () => {
  const page = await newPage(width, width === 390 ? 844 : 568, 'reduce');
  if (width === 320) await page.addInitScript(() => localStorage.setItem('baixi.mobile.v2', JSON.stringify({ size: 'L' })));
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/.test(type) ? null : getContext.call(this, type, ...args); };
  });
  await load(page, 'town');
  await page.getByText('地图暂未加载', { exact: true }).waitFor();
  const retry = page.getByRole('button', { name: '重新加载地图', exact: true });
  assert.ok(await retry.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  }), 'retry button is blocked by a floating card');
  const oldRetry = await retry.elementHandle();
  await retry.click();
  await page.waitForFunction(button => !button.isConnected, oldRetry);
  await page.getByText('地图暂未加载', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/${width}-fallback.png` });
  await page.getByLabel('选择古村', { exact: true }).selectOption('longgong');
  assert.equal(await page.locator('.town-village-copy h3').textContent(), '龙宫村');
  await page.getByRole('button', { name: '查看公交线路', exact: true }).click();
  await page.locator('.screen-route').waitFor();
  return { width, size: width === 320 ? 'L' : 'M', retryCenterReachable: true };
});
}

await check('Non-map pages retain original layout styles after loading the scene', async () => {
  const page = await newPage(390, 844, 'reduce'); await load(page);
  const capture = () => page.evaluate(() => Object.fromEntries(['body', '.phone', '.hero-title', '.app-settings', '.notch-action button', '.groove-item', '.return-mini'].map(selector => {
    const el = document.querySelector(selector), style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return [selector, { style: Object.fromEntries(['color', 'fontFamily', 'fontSize', 'backgroundColor', 'borderRadius', 'minHeight'].map(key => [key, style[key]])), box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }];
  })));
  const before = await capture();
  await nav(page, '古镇'); await readyMap(page); await nav(page, '候车');
  await page.locator('.screen-ride').waitFor(); await settleNav(page);
  assert.deepEqual(await capture(), before);
  assert.equal(await page.locator('.bottom-nav,.geography-app,.mobile-product').count(), 0);
  assert.deepEqual(await rail(page).getByRole('button').allTextContents(), ['候车', '返程', '乘车码', '古镇', '帮助']);
  assert.ok(await page.locator('.route-preview svg').count());
  assert.equal(await page.locator('.route-preview canvas').count(), 0);
  await page.screenshot({ path: `${output}/390-ride-preserved.png` });
});

await check('Original station, return card, ticket, help and retry operations remain intact', async () => {
  const page = await newPage(390, 844, 'reduce'); await load(page);
  await page.getByRole('button', { name: '切换行车方向', exact: true }).click();
  assert.equal(await page.locator('.destination').textContent(), '开往溪畔站');
  await page.getByRole('button', { name: '展开完整线路', exact: true }).click();
  await page.locator('.detail-stops button').last().click();
  await page.getByRole('button', { name: '查找附近站点', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索站点' }).fill('东湖');
  await page.locator('.nearby-list > button').click();
  assert.match(await page.locator('.station-heading').textContent(), /东湖站/); await closeToast(page);
  await nav(page, '返程');
  await page.getByRole('button', { name: '18:00', exact: true }).click();
  await page.getByRole('button', { name: '保存这趟返程', exact: true }).click(); await page.reload();
  assert.equal(await page.locator('.hero-number').textContent(), '18:00');
  await page.getByRole('button', { name: '查看返程卡', exact: true }).click();
  await page.getByRole('button', { name: '移除返程卡', exact: true }).click();
  await nav(page, '乘车码');
  await page.getByRole('button', { name: '查看我的车票', exact: true }).click();
  await page.getByRole('button', { name: '刷新演示票面', exact: true }).click();
  assert.match(await page.locator('.paper-ticket > p').textContent(), /0002/); await closeToast(page);
  await page.getByRole('button', { name: '我的车票记录', exact: true }).click();
  await page.getByRole('heading', { name: '第一程，还未启程' }).waitFor();
  await page.getByRole('button', { name: '查看演示车票', exact: true }).click();
  await nav(page, '帮助');
  await page.getByRole('button', { name: '如何使用乘车码？', exact: true }).click();
  assert.match(await page.locator('.faq-answer').textContent(), /右侧/);
  await page.getByRole('button', { name: '知道了', exact: true }).click();
  await page.getByRole('button', { name: '查看异常状态示例', exact: true }).click();
  await page.getByRole('button', { name: '重新查询', exact: true }).click();
  await page.locator('.screen-ride').waitFor();
});

await check('Original senior home retains four simple actions and never adds a map task', async () => {
  const page = await newPage(390, 844, 'reduce'); await load(page);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('switch', { name: '老年人模式', exact: true }).click();
  assert.equal(await page.locator('.senior-main').count(), 1);
  assert.equal(await page.locator('.senior-tasks button').count(), 4);
  assert.equal(await page.locator('.groove-nav,.town-scene').count(), 0);
  await page.getByRole('button', { name: '换个车站', exact: true }).click();
  await page.getByRole('button', { name: '东湖站', exact: true }).click();
  assert.equal(await page.locator('.senior-boarding h3').textContent(), '东湖站');
  await closeToast(page);
  await page.getByRole('button', { name: '看返程', exact: true }).click();
  await page.getByRole('button', { name: '换个时间', exact: true }).click();
  await page.getByRole('button', { name: '18:00', exact: true }).click();
  await page.getByRole('button', { name: '记住这趟车', exact: true }).click();
  await page.reload(); assert.equal(await page.locator('.senior-time').textContent(), '18:00');
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await page.screenshot({ path: `${output}/390-senior-preserved.png` });
});

checks.push({ name: 'Uncaught JavaScript errors', status: errors.length ? 'FAIL' : 'PASS', detail: errors });
checkNames.push('Uncaught JavaScript errors');
await browser.close();
let mergedChecks = checks;
if (filter) {
  try {
    const previous = JSON.parse(await readFile(report, 'utf8')).checks.filter(check => checkNames.includes(check.name));
    const rerun = new Map(checks.map(check => [check.name, check]));
    mergedChecks = previous.map(check => rerun.get(check.name) || check);
    mergedChecks.push(...checks.filter(check => !previous.some(prior => prior.name === check.name)));
  } catch { /* First filtered run has no previous evidence. */ }
}
await writeFile(report, JSON.stringify({ date: '2026-10-09', base, isolatedBrowserProfile: true, lastRun: { filter: process.env.TOWN_SCENE_TEST_FILTER || null, checks: checks.map(check => check.name) }, checks: mergedChecks }, null, 2));
if (checks.some(check => check.status === 'FAIL')) process.exitCode = 1;
