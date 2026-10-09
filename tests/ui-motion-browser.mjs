import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = 'docs/ui-motion-screenshots', report = 'docs/ui-motion-results.json';
const filter = process.env.UI_MOTION_TEST_FILTER ? new RegExp(process.env.UI_MOTION_TEST_FILTER, 'i') : null;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const checks = [], names = [], errors = [], pages = new Set();
const screens = ['ride', 'return', 'scan', 'route', 'ticket', 'town', 'help', 'delay'];
async function check(name, run) {
  names.push(name); if (filter && !filter.test(name)) return;
  try { const evidence = await run(); checks.push({ name, status: 'PASS', ...(evidence ? { evidence } : {}) }); }
  catch (error) { checks.push({ name, status: 'FAIL', detail: error.message }); }
  finally { await Promise.all([...pages].map(page => page.close())); pages.clear(); }
  console.log(`${checks.at(-1).status}: ${name}`);
}
async function newPage(width = 390, height = 844, reducedMotion = 'no-preference') {
  const page = await browser.newPage({ viewport: { width, height }, locale: 'zh-CN', reducedMotion });
  page.setDefaultTimeout(12000); pages.add(page); page.on('pageerror', error => errors.push(error.message));
  return page;
}
async function load(page, screen = 'ride') {
  await page.goto(`${base}/#/${screen}`); await page.locator(`.mobile-main[data-screen=${screen}]`).waitFor(); await page.evaluate(() => document.fonts.ready);
  if (screen === 'town') await page.locator('.village-pin[aria-pressed=true]').waitFor({ timeout: 30000 });
}
const rail = page => page.getByRole('navigation', { name: '主要导航' });
const nav = (page, label) => rail(page).getByRole('button', { name: label, exact: true }).click();
async function settings(page) { await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('dialog').waitFor(); }
async function closeSettings(page) { await page.getByRole('button', { name: '关闭弹窗', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' }); }

await check('All eight ordinary pages expose text-size controls only inside Settings', async () => {
  const page = await newPage(390, 844, 'reduce');
  for (const screen of screens) {
    await load(page, screen);
    assert.equal(await page.locator('.phone .font-options,.phone .size-controls,.phone .town-font-controls').count(), 0, `${screen}: page still has font controls`);
    assert.equal(await page.getByRole('button', { name: /^[小中大]字号$/ }).count(), 0, `${screen}: page still exposes text-size buttons`);
    await settings(page);
    assert.equal(await page.getByRole('group', { name: '字号选择', exact: true }).count(), 1);
    assert.deepEqual(await page.getByRole('dialog').getByRole('group', { name: '字号选择', exact: true }).getByRole('button').allTextContents(), ['小', '中', '大']);
    assert.equal(await page.locator('.phone .font-options').count(), 0, 'settings must not re-add page controls');
    await closeSettings(page);
  }
  await load(page, 'help');
  await page.getByRole('button', { name: '怎样让文字更大？', exact: true }).click();
  assert.match(await page.locator('.faq-answer').textContent(), /设置.*文字大小/);
  return { screens };
});

await check('Settings size choices scale content, persist and apply across map and transit pages', async () => {
  const page = await newPage(390, 844, 'reduce'); await load(page);
  const sizes = [];
  for (const [label, size] of [['小字号', 'S'], ['中字号', 'M'], ['大字号', 'L']]) {
    await settings(page); await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
    await closeSettings(page);
    sizes.push(await page.locator('.station-heading h3').evaluate(el => parseFloat(getComputedStyle(el).fontSize)));
    assert.equal(await page.locator('html').getAttribute('data-text-size'), size);
    await nav(page, '古镇'); await page.locator('.town-village-card').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-text-size'), size);
    await page.reload(); await page.locator('.town-village-card').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-text-size'), size);
    await settings(page);
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
    await closeSettings(page); await nav(page, '候车'); await page.locator('.screen-ride').waitFor();
  }
  assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2], `size progression: ${sizes}`);
  return { stationFontPixels: sizes };
});

for (const [width, height] of [[390, 844], [320, 568]]) {
  await check(`${width}px large text keeps all eight pages within the phone and actions unobstructed`, async () => {
    const page = await newPage(width, height, 'reduce'), problems = [];
    await page.addInitScript(() => localStorage.setItem('baixi.mobile.v2', JSON.stringify({ size: 'L' })));
    for (const screen of screens) {
      await load(page, screen);
      const found = await page.evaluate(() => {
        const result = [], rect = selector => document.querySelector(selector)?.getBoundingClientRect();
        const overlap = (a, b) => a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
        if (document.documentElement.scrollWidth > innerWidth + 1) result.push('horizontal page scroll');
        if (document.documentElement.scrollHeight > innerHeight + 1) result.push('vertical page scroll');
        const action = rect('.notch-action button'), returnCard = rect('.return-mini');
        if (action && returnCard && action.bottom + 2 > returnCard.top) result.push('primary action overlaps return card');
        const title = rect('.hero-title'), panel = rect('.sculpt-frame');
        if (title && panel && title.bottom + 2 > panel.top) result.push('title overlaps panel');
        if (document.querySelector('.town-scene')) {
          for (const [a, b] of [['.town-title-card', '.town-route-identity'], ['.town-village-card', '.town-village-picker'], ['.town-village-picker', '.town-return-action']]) if (overlap(rect(a), rect(b))) result.push(`${a} overlaps ${b}`);
          const selected = rect('.village-pin[aria-pressed=true]');
          for (const selector of ['.town-scene-header', '.town-scene-dock', '.groove-rail']) if (overlap(selected, rect(selector))) result.push(`map selection hidden by ${selector}`);
        }
        for (const element of document.querySelectorAll('.groove-item,.notch-action button,.town-route-action,.town-return-action,.town-village-picker select')) {
          const box = element.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          if (!hit || !element.contains(hit)) result.push(`unreachable action: ${element.getAttribute('aria-label') || element.textContent.trim()}`);
          if (box.left < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1) result.push('action outside phone');
        }
        return result;
      });
      problems.push(...found.map(problem => `${screen}: ${problem}`));
      if (['ride', 'town', 'return', 'help'].includes(screen)) await page.screenshot({ path: `${output}/${width}-${screen}-L.png` });
    }
    assert.deepEqual(problems, []);
    return { screens, size: 'L', viewport: { width, height } };
  });
}

for (const [width, height] of [[390, 844], [320, 568]]) {
  await check(`${width}px rapid navigation keeps the same groove, synchronized motion and the final route`, async () => {
    const page = await newPage(width, height); await load(page); await page.waitForTimeout(550);
    const samples = await page.evaluate(() => new Promise(resolve => {
      const original = document.querySelector('.groove-rail'), start = performance.now(), samples = [];
      const labels = ['返程', '乘车码', '古镇', '候车', '帮助'];
      labels.forEach((label, index) => setTimeout(() => [...document.querySelectorAll('.groove-item')].find(button => button.textContent.trim() === label).click(), index * 100));
      function record(now) {
        const circle = document.querySelector('.groove-disc'), outline = document.querySelector('.groove-outline');
        samples.push({ y: +circle.getAttribute('cy'), groove: +outline.dataset.center, sameRail: original === document.querySelector('.groove-rail'), slots: [...document.querySelectorAll('.groove-item')].map(button => button.offsetTop) });
        if (now - start < 1250) requestAnimationFrame(record); else resolve(samples);
      }
      requestAnimationFrame(record);
    }));
    assert.ok(samples.every(sample => sample.sameRail));
    assert.ok(samples.every(sample => sample.y === sample.groove));
    assert.ok(new Set(samples.map(sample => sample.y.toFixed(2))).size > 8, 'groove lacks intermediate positions');
    assert.ok(new Set(samples.map(sample => JSON.stringify(sample.slots))).size <= 2, 'icon slots moved with the disc');
    assert.ok(page.url().endsWith('/help'));
    await page.locator('.screen-help').waitFor();
    assert.equal(await rail(page).getByRole('button', { name: '帮助', exact: true }).getAttribute('aria-current'), 'page');
    const error = await page.evaluate(() => {
      const disc = document.querySelector('.groove-disc').getBoundingClientRect(), button = document.querySelector('.groove-item.active').getBoundingClientRect();
      return Math.abs(disc.y + disc.height / 2 - button.y - button.height / 2);
    });
    assert.ok(error < .75, `follower did not settle: ${error}`);
    return { sampledFrames: samples.length, distinctFollowerPositions: new Set(samples.map(sample => sample.y.toFixed(2))).size };
  });
}

await check('Settings exits smoothly, keeps its modal during exit and restores focus', async () => {
  const page = await newPage(); await load(page); await settings(page);
  await page.waitForTimeout(550);
  const evidence = await page.evaluate(() => new Promise(resolve => {
    const start = performance.now(), samples = [];
    document.querySelector('.sheet-close').click();
    function record(now) {
      const dialog = document.querySelector('.sheet-panel[open]');
      samples.push({ at: now - start, exists: !!dialog, open: !!dialog?.open, opacity: dialog ? Number(getComputedStyle(dialog).opacity) : null });
      if (now - start < 850) requestAnimationFrame(record); else resolve(samples);
    }
    requestAnimationFrame(record);
  }));
  const present = evidence.filter(sample => sample.exists);
  assert.ok(present.length > 2, 'dialog closed without an exit transition');
  assert.ok(present.every(sample => sample.open), 'dialog stopped being modal before exit completed');
  assert.ok(new Set(present.map(sample => sample.opacity.toFixed(3))).size > 2, 'dialog does not fade during exit');
  assert.equal(evidence.at(-1).exists, false);
  assert.ok(await page.getByRole('button', { name: '设置', exact: true }).evaluate(el => el === document.activeElement));
  await settings(page); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.ok(await page.getByRole('button', { name: '设置', exact: true }).evaluate(el => el === document.activeElement));
  await settings(page); await closeSettings(page);
  assert.equal(await page.getByRole('dialog').count(), 0);
  return { exitFrames: present.length, lastVisibleAt: present.at(-1).at };
});

for (const mode of ['system', 'preference']) {
  await check(`${mode} reduced motion disables CSS and dialog exit animation while preserving controls`, async () => {
    const page = await newPage(390, 844, mode === 'system' ? 'reduce' : 'no-preference'); await load(page);
    if (mode === 'preference') {
      await settings(page); await page.getByRole('dialog').getByRole('checkbox', { name: '减少动态效果', exact: true }).check();
      await page.waitForFunction(() => document.documentElement.dataset.motion === 'reduced'); await closeSettings(page);
    }
    await settings(page);
    const styles = await page.evaluate(() => ({ sheet: getComputedStyle(document.querySelector('.sheet-panel')).animationName, headline: getComputedStyle(document.querySelector('.headline')).animationName, groove: getComputedStyle(document.querySelector('.groove-symbol')).transitionDuration }));
    assert.equal(styles.sheet, 'none'); assert.equal(styles.headline, 'none'); assert.equal(styles.groove, '0s');
    const stillOpen = await page.evaluate(() => new Promise(resolve => {
      document.querySelector('.sheet-close').click();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(!!document.querySelector('.sheet-panel[open]'))));
    }));
    assert.equal(stillOpen, false, 'reduced motion waits for an animated close');
    assert.ok(await page.getByRole('button', { name: '设置', exact: true }).evaluate(el => el === document.activeElement));
    await nav(page, '帮助'); await page.locator('.screen-help').waitFor();
    assert.equal(await rail(page).getByRole('button', { name: '帮助', exact: true }).getAttribute('aria-current'), 'page');
    return styles;
  });
}

await check('Senior mode keeps its original four actions and text controls only in Settings', async () => {
  const page = await newPage(390, 844, 'reduce'); await load(page); await settings(page);
  await page.getByRole('switch', { name: '老年人模式', exact: true }).click();
  await page.locator('.senior-main').waitFor();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.senior-tasks button').count(), 4);
  assert.equal(await page.getByRole('button', { name: /^[小中大]字号$/ }).count(), 0);
  await settings(page);
  assert.equal(await page.getByRole('dialog').getByRole('group', { name: '字号选择', exact: true }).count(), 1);
  await closeSettings(page);
});

checks.push({ name: 'Uncaught JavaScript errors', status: errors.length ? 'FAIL' : 'PASS', detail: errors }); names.push('Uncaught JavaScript errors');
await browser.close();
let merged = checks;
if (filter) {
  try {
    const previous = JSON.parse(await readFile(report, 'utf8')).checks.filter(check => names.includes(check.name));
    const rerun = new Map(checks.map(check => [check.name, check]));
    merged = previous.map(check => rerun.get(check.name) || check);
    merged.push(...checks.filter(check => !previous.some(prior => prior.name === check.name)));
  } catch { /* First filtered run has no prior evidence. */ }
}
await writeFile(report, JSON.stringify({ date: '2026-10-09', base, isolatedBrowserProfile: true, lastRun: { filter: process.env.UI_MOTION_TEST_FILTER || null, checks: checks.map(check => check.name) }, checks: merged }, null, 2));
if (checks.some(check => check.status === 'FAIL')) process.exitCode = 1;
