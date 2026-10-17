import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = '.delivery/bus-v221', reportPath = `${output}/theme-bus-results.json`;
const filter = process.env.THEME_BUS_TEST_FILTER ? new RegExp(process.env.THEME_BUS_TEST_FILTER, 'i') : null;
// Captured from the user's original attachment; tests do not depend on a temporary path.
const originalSha256 = '12bfc677e5a4290b697617cd6ee455549a3dd1c45a5640bfccd29851302ba033';
const choices = [[.1, 'qiantong', '前童'], [.3, 'xujiashan', '许家山'], [.6, 'longgong', '龙宫'], [.9, 'liyang', '力洋']];
const cases = [[320, 568, 'L'], [360, 780, 'L'], [390, 844, 'M'], [390, 844, 'L'], [430, 932, 'M'], [1440, 900, 'M']];
const screens = ['ride', 'return', 'scan', 'ticket', 'town', 'help'];
const checks = [], names = [], captures = [], errors = [], contexts = new Set();
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
async function check(name, run) {
  names.push(name); if (filter && !filter.test(name)) return;
  try { checks.push({ name, status: 'PASS', at: new Date().toISOString(), evidence: await run() }); }
  catch (error) { checks.push({ name, status: 'FAIL', at: new Date().toISOString(), detail: error.message }); }
  console.log(`${checks.at(-1).status}: ${name}${checks.at(-1).detail ? '\n' + checks.at(-1).detail : ''}`);
  await writeFile(`${output}/theme-bus-progress.json`, JSON.stringify({ at: new Date().toISOString(), checks, captures }, null, 2));
}
async function create(random = .1) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', reducedMotion: 'no-preference' }); contexts.add(context);
  const page = await context.newPage(); page.setDefaultTimeout(18000); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(value => {
    const original = Math.random;
    Math.random = () => value;
    window.__restoreThemeTestRandom = () => { Math.random = original; };
  }, random);
  await page.goto(`${base}/#/ride`, { waitUntil: 'domcontentloaded' });
  await page.locator('.launch-app[data-launch=done]').waitFor(); await page.locator('.mobile-main[data-screen=ride]').waitFor();
  // Only the app's initial theme choice is deterministic. MapLibre needs fresh
  // random IDs when its lazy map is mounted later during town navigation.
  await page.evaluate(() => { window.__restoreThemeTestRandom(); return document.fonts.ready; });
  await page.waitForTimeout(550); return { context, page };
}
async function visit(page, screen) {
  await page.evaluate(screen => { location.hash = `/${screen}`; }, screen);
  await page.locator(`.mobile-main[data-screen=${screen}]`).waitFor(); await page.locator('.theme-bus').waitFor();
  if (screen === 'town') {
    await page.locator('.town-village-picker select').waitFor();
    await page.locator('.village-pin[aria-pressed=true]').waitFor({ timeout: 30000 });
  }
  await page.waitForTimeout(620);
}
async function theme(page, expected) {
  assert.equal(await page.locator('.phone .theme-bus').count(), 1);
  assert.equal(await page.locator('.phone .theme-bus').getAttribute('data-bus-theme'), expected);
  const identity = page.locator('.phone .route-identity,.phone .town-route-identity'); assert.equal(await identity.count(), 1);
  assert.equal(await identity.locator('strong').innerText(), '宁海旅游专线'); assert.equal(await identity.locator('.bus-model').innerText(), 'XML6805JEVJ0C8');
  assert.ok((await page.locator('.theme-bus image').getAttribute('href')).endsWith('/brand/town-buses.png'));
  assert.equal(await page.locator('.theme-bus image').count(), 1);
}
async function size(page, value) {
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: `${{ S: '小', M: '中', L: '大' }[value]}字号`, exact: true }).click();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click(); await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('html').getAttribute('data-text-size'), value); await page.waitForTimeout(550);
}
async function screenshot(page, name) {
  const path = `${output}/${name}.png`; await page.screenshot({ path }); captures.push({ name, path, viewport: page.viewportSize(), at: new Date().toISOString() }); return path;
}
async function geometry(page) {
  return page.evaluate(() => {
    const rect = selector => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const overlap = (a, b) => a && b && a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1;
    const right = rect('.route-identity') || rect('.town-route-identity'), title = rect('.hero-title') || rect('.town-title-card'), caption = rect('.headline>p');
    const problems = [];
    if (overlap(right, title)) problems.push('right identity overlaps left title');
    if (overlap(right, caption)) problems.push('right identity overlaps left caption');
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('horizontal document overflow');
    if (document.documentElement.scrollHeight > innerHeight + 1) problems.push('vertical document overflow');
    const phone = rect('.phone');
    for (const selector of ['.theme-bus', '.route-identity strong', '.bus-model', '.town-route-identity strong']) {
      const r = rect(selector); if (!r) continue;
      if (r.x < phone.x - 1 || r.right > phone.right + 1 || r.y < phone.y - 1 || r.bottom > phone.bottom + 1) problems.push(`${selector} leaves phone`);
    }
    const bus = document.querySelector('.theme-bus'), model = document.querySelector('.bus-model'), strong = document.querySelector('.route-identity strong,.town-route-identity strong');
    for (const el of [model, strong]) if (el && el.scrollWidth > el.clientWidth + 1) problems.push(`${el.className || el.tagName} text clipped`);
    return { screen: document.querySelector('.mobile-main')?.dataset.screen, viewport: { width: innerWidth, height: innerHeight }, size: document.documentElement.dataset.textSize,
      right, title, caption, bus: rect('.theme-bus'), model: rect('.bus-model'), fonts: { title: getComputedStyle(strong).fontSize, model: getComputedStyle(model).fontSize },
      theme: bus.dataset.busTheme, problems };
  });
}

await check('The supplied artwork is byte-identical and selection uses four equal-width random ranges', async () => {
  const bytes = await readFile('public/brand/town-buses.png'), sha256 = createHash('sha256').update(bytes).digest('hex'); assert.equal(sha256, originalSha256); assert.equal(bytes.length, 1422312);
  const source = await readFile('src/mobile/TransitApp.tsx', 'utf8'); assert.match(source, /useState\(\(\) => Math\.floor\(Math\.random\(\) \* busThemes\.length\)\)/);
  return { sha256, bytes: bytes.length, originalAttachment: 'codex-clipboard-e2d2c782-dea5-48fb-9040-df89be44fb85.png', forcedValues: choices.map(([random, theme]) => ({ random, theme })) };
});

for (const [random, id, label] of choices) {
  await check(`Random ${random} shows only the ${label} bus and leaves NH brand marks intact`, async () => {
    const { page, context } = await create(random);
    try {
      await theme(page, id); assert.equal(await page.locator('.theme-bus').getAttribute('aria-label'), `${label}主题巴士`);
      const image = await page.locator('.theme-bus image').evaluate(async el => { const img = new Image(); img.src = el.getAttribute('href'); await img.decode(); return { width: img.naturalWidth, height: img.naturalHeight }; });
      assert.deepEqual(image, { width: 1024, height: 1024 });
      assert.ok(await page.locator('.vertical-signature .nh-mark').isVisible());
      assert.ok((await page.locator('.studio-brand .nh-mark').getAttribute('src')).endsWith('/brand/nh-logo.svg'));
      await screenshot(page, `theme-${id}-390`); const art = `${output}/theme-${id}-art.png`; await page.locator('.theme-bus').screenshot({ path: art }); captures.push({ name: `theme-${id}-art`, path: art, at: new Date().toISOString() });
      return { random, theme: id, name: label, image, viewBox: await page.locator('.theme-bus').getAttribute('viewBox'), nhMarksPreserved: true };
    } finally { await context.close(); contexts.delete(context); }
  });
}

await check('Navigation, village changes and Settings keep one theme and the original route buttons still work', async () => {
  const { page, context } = await create(.6);
  try {
    for (const screen of ['return', 'scan', 'ticket', 'help', 'town']) { await visit(page, screen); await theme(page, 'longgong'); }
    await page.locator('.town-village-picker select').selectOption('longgong'); await theme(page, 'longgong');
    await size(page, 'L'); await theme(page, 'longgong');
    await page.locator('.town-route-identity').click(); await page.locator('.mobile-main[data-screen=route]').waitFor(); await theme(page, 'longgong');
    assert.equal(await page.locator('.mobile-main').getAttribute('data-journey-mode'), 'research'); assert.equal(await page.locator('.mobile-main').getAttribute('data-origin'), 'longgong');
    assert.equal(await page.locator('.detail-stops button').count(), 4);
    await visit(page, 'ride'); await page.locator('.route-preview').click(); await page.locator('.mobile-main[data-screen=route]').waitFor();
    assert.equal(await page.locator('.mobile-main').getAttribute('data-journey-mode'), 'demo');
    await visit(page, 'ride'); await page.locator('.route-identity').click(); await page.locator('.mobile-main[data-screen=route]').waitFor();
    assert.deepEqual(await page.locator('.detail-stops strong').allTextContents(), ['溪畔站', '青云路站', '东湖站', '城南客运站']); await theme(page, 'longgong');
    return { stableTheme: 'longgong', villageOrigin: 'longgong', researchAndDemoRoutesUsable: true };
  } finally { await context.close(); contexts.delete(context); }
});

let layout;
for (const [width, height, value] of cases) {
  await check(`${width}x${height} ${value} six-page headings and bus labels do not overlap or overflow`, async () => {
    if (!layout) layout = await create(.3);
    const { page } = layout; await page.setViewportSize({ width, height }); await size(page, value);
    const observations = [], problems = [];
    for (const screen of screens) {
      await visit(page, screen); await theme(page, 'xujiashan'); const result = await geometry(page); observations.push(result);
      problems.push(...result.problems.map(problem => ({ screen, problem, right: result.right, title: result.title, caption: result.caption })));
      if (['ride', 'town'].includes(screen) || result.problems.length) await screenshot(page, `layout-${width}-${height}-${value}-${screen}`);
    }
    await writeFile(`${output}/layout-${width}-${height}-${value}.json`, JSON.stringify(observations, null, 2));
    assert.deepEqual(problems, []); return observations;
  });
}
if (layout) { await layout.context.close(); contexts.delete(layout.context); }
await Promise.all([...contexts].map(context => context.close())); await browser.close();
checks.push({ name: 'No uncaught JavaScript errors', status: errors.length ? 'FAIL' : 'PASS', at: new Date().toISOString(), evidence: errors }); names.push('No uncaught JavaScript errors');
let merged = checks, allCaptures = captures;
if (filter) {
  try {
    const previous = JSON.parse(await readFile(reportPath, 'utf8')), current = new Map(checks.map(check => [check.name, check]));
    merged = previous.checks.filter(check => names.includes(check.name)).map(check => current.get(check.name) || check);
    merged.push(...checks.filter(check => !merged.some(prior => prior.name === check.name)));
    allCaptures = previous.captures.filter(capture => !captures.some(current => current.path === capture.path)).concat(captures);
  } catch { /* A first filtered run has no prior report. */ }
}
await writeFile(reportPath, JSON.stringify({ at: new Date().toISOString(), base, isolatedBrowserProfiles: true, lastRun: { filter: process.env.THEME_BUS_TEST_FILTER || null, checks: checks.map(check => check.name) }, checks: merged, captures: allCaptures }, null, 2));
if (checks.some(check => check.status === 'FAIL')) process.exitCode = 1;
