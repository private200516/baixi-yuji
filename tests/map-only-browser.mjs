import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = 'docs/map-only-screenshots';
await mkdir(output, { recursive: true });
const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const checks = [], errors = [], pages = new Set();
const filter = process.env.MAP_ONLY_TEST_FILTER ? new RegExp(process.env.MAP_ONLY_TEST_FILTER, 'i') : null;
async function check(name, run) {
  if (filter && !filter.test(name)) return;
  try { await run(); checks.push({ name, status: 'PASS' }); }
  catch (error) { checks.push({ name, status: 'FAIL', detail: error.message }); }
  finally { await Promise.all([...pages].map(page => page.close())); pages.clear(); }
}
async function newPage(width = 390, height = 844) {
  const page = await browser.newPage({ viewport: { width, height }, locale: 'zh-CN', reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000); pages.add(page);
  page.on('pageerror', error => errors.push(error.message));
  return page;
}
async function load(page, screen = 'ride') {
  await page.goto(`${base}/#/${screen}`); await page.locator('.phone').waitFor(); await page.evaluate(() => document.fonts.ready);
}
const rail = page => page.getByRole('navigation', { name: '主要导航' });
const nav = (page, name) => rail(page).getByRole('button', { name, exact: true }).click();
async function closeToast(page) { const close = page.getByRole('button', { name: '关闭提示', exact: true }); if (await close.count()) await close.click(); }
async function readyMap(page) { await page.locator('.legacy-town-map .village-pin').first().waitFor({ timeout: 30000 }); }

await check('Original shell, five-item navigation and ride preview are retained', async () => {
  const page = await newPage(); await load(page);
  assert.equal(await page.locator('.bottom-nav,.mobile-product,.geography-app,.journey-panel').count(), 0);
  assert.deepEqual(await rail(page).getByRole('button').allTextContents(), ['候车', '返程', '乘车码', '古镇', '帮助']);
  assert.equal(await page.locator('.route-preview').count(), 1);
  assert.equal(await page.locator('.route-preview canvas,.route-preview .village-pin').count(), 0);
  assert.ok(await page.locator('.route-preview svg').count());
  assert.equal(await page.locator('.sculpt-frame,.sculpt-tail,.lower-landscape').count(), 3);
  assert.match(await page.locator('.experience').innerText(), /乡序/);
  assert.doesNotMatch(await page.locator('.experience').innerText(), /白溪舆记|白溪輿記/);
  await page.screenshot({ path: `${output}/390-ride.png` });
});

await check('Original waiting direction, route details and station selection flow', async () => {
  const page = await newPage(); await load(page);
  await page.getByRole('button', { name: '切换行车方向', exact: true }).click();
  assert.equal(await page.locator('.destination').textContent(), '开往溪畔站');
  await page.getByRole('button', { name: '展开完整线路', exact: true }).click();
  assert.match(await page.locator('.route-title').textContent(), /城南客运站.*溪畔站/);
  await page.locator('.detail-stops button').last().click();
  assert.equal(await page.locator('.destination').textContent(), '开往城南客运站');
  await page.getByRole('button', { name: '查找附近站点', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索站点' }).fill('不存在');
  await page.getByRole('heading', { name: '没有找到这个站' }).waitFor();
  await page.getByRole('button', { name: '查看全部站点', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索站点' }).fill('东湖');
  await page.locator('.nearby-list > button').click();
  assert.match(await page.locator('.station-heading').textContent(), /东湖站/);
  assert.equal(await page.locator('.hero-number').textContent(), '8');
  await closeToast(page);
  const trigger = page.getByRole('button', { name: '查找附近站点', exact: true });
  await trigger.click(); await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.ok(await trigger.evaluate(el => el === document.activeElement));
});

await check('Original favorite, return time, saved return and removal persist', async () => {
  const page = await newPage(); await load(page);
  await page.getByRole('button', { name: '收藏线路', exact: true }).click(); await page.reload();
  assert.equal(await page.getByRole('button', { name: '取消收藏线路', exact: true }).getAttribute('aria-pressed'), 'true');
  await nav(page, '返程');
  await page.getByRole('button', { name: '18:00', exact: true }).click();
  await page.getByRole('button', { name: '保存这趟返程', exact: true }).click(); await page.reload();
  assert.equal(await page.locator('.hero-number').textContent(), '18:00');
  await page.getByRole('button', { name: '查看返程卡', exact: true }).click();
  await page.getByRole('button', { name: '移除返程卡', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '保存这趟返程', exact: true }).count(), 1);
});

await check('Original QR, ticket refresh, empty orders, help and retry flow', async () => {
  const page = await newPage(); await load(page, 'scan');
  await page.getByRole('button', { name: '查看我的车票', exact: true }).click();
  await page.getByRole('button', { name: '刷新演示票面', exact: true }).click();
  assert.match(await page.locator('.paper-ticket > p').textContent(), /0002/); await closeToast(page);
  await page.getByRole('button', { name: '我的车票记录', exact: true }).click();
  await page.getByRole('heading', { name: '第一程，还未启程' }).waitFor();
  await page.getByRole('button', { name: '查看演示车票', exact: true }).click();
  await nav(page, '帮助');
  const phoneHeight = await page.locator('.phone').evaluate(el => el.clientHeight);
  await page.getByRole('button', { name: '如何使用乘车码？', exact: true }).click();
  assert.match(await page.locator('.faq-answer').textContent(), /右侧/);
  await page.getByRole('button', { name: '知道了', exact: true }).click();
  assert.equal(await page.locator('.phone').evaluate(el => el.clientHeight), phoneHeight);
  await page.getByRole('checkbox', { name: /减少动态效果/ }).check(); await page.reload();
  assert.ok(await page.getByRole('checkbox', { name: /减少动态效果/ }).isChecked());
  await page.getByRole('button', { name: '查看异常状态示例', exact: true }).click();
  await page.getByRole('button', { name: '重新查询', exact: true }).click();
  await page.locator('.screen-ride').waitFor();
});

await check('Town map true-village selection updates the original description and keeps route entry', async () => {
  const page = await newPage(); await load(page, 'town'); await readyMap(page);
  const map = page.locator('.legacy-town-map');
  assert.equal(await map.locator('.village-pin').count(), 5);
  const selector = map.getByLabel('选择古村', { exact: true });
  assert.equal(await selector.locator('option').count(), 5);
  await selector.selectOption('qingtan');
  assert.equal(await page.locator('.landmark-description').getAttribute('data-village-id'), 'qingtan');
  assert.match(await page.locator('.landmark-description h3').textContent(), /清潭村/);
  assert.equal(await map.locator('.village-pin[data-village-id=qingtan]').getAttribute('aria-pressed'), 'true');
  await map.locator('.village-pin[data-village-id=longgong]').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('.landmark-description').getAttribute('data-village-id'), 'longgong');
  await map.getByRole('button', { name: '村内', exact: true }).click();
  await map.getByRole('button', { name: '立体', exact: true }).click();
  assert.equal(await map.getByRole('button', { name: '立体', exact: true }).getAttribute('aria-pressed'), 'true');
  await map.getByRole('button', { name: '平面', exact: true }).click();
  assert.equal(await page.locator('.landmark-description').getAttribute('data-village-id'), 'longgong');
  assert.ok(await map.getByRole('link', { name: /OpenStreetMap/ }).isVisible());
  await map.getByRole('button', { name: '全县', exact: true }).click();
  await page.screenshot({ path: `${output}/390-town.png` });
  await page.getByRole('button', { name: '查看公交线路', exact: true }).click();
  await page.locator('.screen-route').waitFor();
});

await check('Lazy map styles do not change the original non-map UI', async () => {
  const page = await newPage(); await load(page);
  const styles = () => page.evaluate(() => Object.fromEntries(['body', '.phone', '.hero-title', '.app-settings', '.notch-action button', '.groove-item', '.return-mini'].map(selector => {
    const style = getComputedStyle(document.querySelector(selector));
    return [selector, Object.fromEntries(['color', 'fontFamily', 'fontSize', 'backgroundColor', 'borderRadius', 'minHeight'].map(key => [key, style[key]]))];
  })));
  await page.locator('.screen-ride').waitFor();
  await page.locator('.groove-item.active').filter({ hasText: '候车' }).waitFor();
  const before = await styles();
  await nav(page, '古镇'); await readyMap(page); await nav(page, '候车');
  await page.locator('.screen-ride').waitFor();
  await page.locator('.groove-item.active').filter({ hasText: '候车' }).waitFor();
  assert.deepEqual(await styles(), before);
  const importedNewShell = await page.evaluate(() => {
    const fullShellFiles = [...document.querySelectorAll('style[data-vite-dev-id],link[rel=stylesheet]')].some(el => /\/geography\/(?:geography|mobile-product)\.css(?:\?|$)/.test(el.getAttribute('data-vite-dev-id') || el.getAttribute('href') || ''));
    // Shared map-depth.css retains a few inactive, scoped .mobile-product descendants;
    // only the actual page-root rules identify importing either abandoned page shell.
    return fullShellFiles || [...document.styleSheets].some(sheet => {
      try { return [...sheet.cssRules].some(rule => ['.geography-app', '.mobile-product'].includes(rule.selectorText || '')); } catch { return false; }
    });
  });
  assert.equal(importedNewShell, false, 'abandoned geography page shell styles remain imported');
});

await check('Original three text sizes, settings and preference restoration', async () => {
  const page = await newPage(); await load(page);
  const sizes = [];
  for (const name of ['小字号', '中字号', '大字号']) {
    await page.getByRole('button', { name, exact: true }).click();
    sizes.push(await page.locator('.station-heading h3').evaluate(el => parseFloat(getComputedStyle(el).fontSize)));
  }
  assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2]);
  await page.reload(); assert.equal(await page.getByRole('button', { name: '大字号', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '中字号', exact: true }).click();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '中字号', exact: true }).getAttribute('aria-pressed'), 'true');
});

await check('Original senior four-action home, station, return, QR and help flows remain', async () => {
  const page = await newPage(); await load(page);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('switch', { name: '老年人模式', exact: true }).click();
  assert.equal(await page.locator('.senior-main').count(), 1);
  assert.equal(await page.locator('.groove-nav,.legacy-town-map').count(), 0);
  assert.equal(await page.locator('.senior-tasks button').count(), 4);
  assert.equal(await page.locator('html').getAttribute('data-motion'), 'reduced');
  await page.reload();
  await page.getByRole('button', { name: '换个车站', exact: true }).click();
  await page.getByRole('button', { name: '东湖站', exact: true }).click(); await closeToast(page);
  assert.equal(await page.locator('.senior-boarding h3').textContent(), '东湖站');
  await page.getByRole('button', { name: '看返程', exact: true }).click();
  await page.getByRole('button', { name: '换个时间', exact: true }).click();
  await page.getByRole('button', { name: '18:00', exact: true }).click();
  await page.getByRole('button', { name: '记住这趟车', exact: true }).click(); await page.reload();
  assert.equal(await page.locator('.senior-time').textContent(), '18:00');
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  for (const [label, route] of [['乘车码', 'scan'], ['找人帮忙', 'help']]) {
    await page.getByRole('button', { name: label, exact: true }).click(); assert.ok(page.url().endsWith(route));
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
  }
  await page.screenshot({ path: `${output}/390-senior.png` });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('switch', { name: '老年人模式', exact: true }).click();
  assert.equal(await page.locator('.groove-nav').count(), 1);
  assert.equal(await page.locator('html').getAttribute('data-text-size'), 'M');
});

await check('Original groove moves continuously and icons retain their five slots', async () => {
  const page = await newPage(); await load(page);
  const positions = () => page.locator('.groove-item').evaluateAll(items => items.map(item => item.getBoundingClientRect().y));
  const before = await positions(), path = await page.locator('.groove-outline').getAttribute('d');
  await nav(page, '返程');
  assert.deepEqual(await positions(), before);
  assert.notEqual(await page.locator('.groove-outline').getAttribute('d'), path);
  assert.equal(await page.locator('.groove-outline').getAttribute('data-center'), await page.locator('.groove-disc').getAttribute('cy'));
});

for (const [width, height] of [[390, 844], [320, 568]]) {
  await check(`${width}px original eight pages keep the phone bounds and action spacing`, async () => {
    const page = await newPage(width, height), issues = [];
    for (const screen of ['ride', 'return', 'scan', 'route', 'ticket', 'town', 'help', 'delay']) {
      await load(page, screen); if (screen === 'town') await readyMap(page);
      const problems = await page.evaluate(() => {
        const result = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) result.push('horizontal scroll');
        if (document.documentElement.scrollHeight > innerHeight + 1) result.push('page vertical scroll');
        const action = document.querySelector('.notch-action button').getBoundingClientRect(), card = document.querySelector('.return-mini').getBoundingClientRect();
        if (action.bottom + 2 > card.top) result.push('primary action overlaps return card');
        if (action.bottom > innerHeight + 1) result.push('primary action below phone viewport');
        const heading = document.querySelector('.hero-title').getBoundingClientRect(), panel = document.querySelector('.sculpt-frame').getBoundingClientRect();
        if (heading.bottom + 2 > panel.top) result.push('heading overlaps sculpted panel');
        const map = document.querySelector('.legacy-town-map');
        if (map) {
          const mapBox = map.getBoundingClientRect(), body = document.querySelector('.teal-content').getBoundingClientRect();
          if (mapBox.left < body.left - 1 || mapBox.right > body.right + 1 || mapBox.bottom > body.bottom + 1) result.push('map extends outside original panel');
          const description = document.querySelector('.landmark-description').getBoundingClientRect();
          if (mapBox.bottom > description.top + 1) result.push('map overlaps village description');
        }
        return result;
      });
      issues.push(...problems.map(problem => `${screen}: ${problem}`));
      if (screen === 'town') await page.screenshot({ path: `${output}/${width}-town.png` });
    }
    assert.deepEqual(issues, []);
  });
}

checks.push({ name: 'Uncaught JavaScript errors', status: errors.length ? 'FAIL' : 'PASS', detail: errors });
await browser.close();
let mergedChecks = checks;
if (filter) {
  try {
    const previous = JSON.parse(await readFile('docs/map-only-results.json', 'utf8')).checks;
    const rerun = new Map(checks.map(check => [check.name, check]));
    mergedChecks = previous.map(check => rerun.get(check.name) || check);
    mergedChecks.push(...checks.filter(check => !previous.some(prior => prior.name === check.name)));
  } catch { /* A filtered first run has no older evidence to retain. */ }
}
await writeFile('docs/map-only-results.json', JSON.stringify({ date: '2026-10-09', base, lastRun: { filter: process.env.MAP_ONLY_TEST_FILTER || null, checks: checks.map(check => check.name) }, checks: mergedChecks }, null, 2));
console.log(JSON.stringify(checks, null, 2));
if (checks.some(check => check.status === 'FAIL')) process.exitCode = 1;
