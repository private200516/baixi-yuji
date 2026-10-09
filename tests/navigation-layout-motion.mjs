import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = '.delivery/navigation-motion', report = `${output}/results.json`;
const filter = process.env.NAV_LAYOUT_TEST_FILTER ? new RegExp(process.env.NAV_LAYOUT_TEST_FILTER, 'i') : null;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const checks = [], names = [], errors = [], pages = new Set();
async function check(name, run) {
  names.push(name); if (filter && !filter.test(name)) return;
  try { const evidence = await run(); checks.push({ name, status: 'PASS', evidence }); }
  catch (error) { checks.push({ name, status: 'FAIL', detail: error.message }); }
  finally { await Promise.all([...pages].map(page => page.close())); pages.clear(); }
  console.log(`${checks.at(-1).status}: ${name}`);
}
async function newPage(width, height, { size = 'M', system = false, quiet = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, locale: 'zh-CN', reducedMotion: system ? 'reduce' : 'no-preference' });
  pages.add(page); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ size, quiet }) => localStorage.setItem('baixi.mobile.v2', JSON.stringify({ size, quiet })), { size, quiet });
  await page.goto(`${base}/#/ride`); await page.locator('.mobile-main[data-screen=ride]').waitFor();
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(650);
  return page;
}

// These are viewport coordinates, not offsetTop/cy alone: the previous regression
// left the SVG animation intact while its entire rail jumped to another location.
async function sample(page, actions, duration = 1300) {
  return page.evaluate(({ actions, duration }) => new Promise(resolve => {
    const originalRail = document.querySelector('.groove-rail'), originalNav = document.querySelector('.groove-nav');
    const start = performance.now(), frames = [];
    const bounds = element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    function capture(now) {
      const rail = document.querySelector('.groove-rail'), disc = document.querySelector('.groove-disc');
      const items = [...document.querySelectorAll('.groove-item')].map(bounds);
      return { at: now - start, screen: document.querySelector('.mobile-main').dataset.screen,
        rail: bounds(rail), items, gaps: items.slice(1).map((item, index) => item.y - items[index].y),
        cy: +disc.getAttribute('cy'), groove: +document.querySelector('.groove-outline').dataset.center,
        sameNode: originalRail === rail && originalNav === document.querySelector('.groove-nav'), fill: getComputedStyle(disc).fill,
        circle: bounds(disc), active: document.querySelector('.groove-item.active')?.textContent.trim() };
    }
    frames.push(capture(start));
    for (const { label, at } of actions) setTimeout(() => {
      [...document.querySelectorAll('.groove-item')].find(button => button.textContent.trim() === label).click();
    }, at);
    function record(now) {
      frames.push(capture(now));
      if (now - start < duration) requestAnimationFrame(record); else resolve(frames);
    }
    requestAnimationFrame(record);
  }), { actions, duration });
}

function seriesEvidence(values) {
  const min = Math.min(...values), max = Math.max(...values);
  return { range: max - min, distinct: new Set(values.map(value => value.toFixed(2))).size,
    largestStep: Math.max(0, ...values.slice(1).map((value, index) => Math.abs(value - values[index]))) };
}
function assertContinuous(frames, label, { checkColor = true } = {}) {
  assert.ok(frames.every(frame => frame.sameNode), `${label}: navigation remounted`);
  for (const frame of frames) assert.equal(frame.cy, frame.groove, `${label}: SVG disc and groove diverged`);
  const geometry = {};
  for (const key of ['x', 'y', 'width', 'height']) geometry[`rail.${key}`] = seriesEvidence(frames.map(frame => frame.rail[key]));
  for (let index = 0; index < 5; index++) {
    geometry[`item${index}.y`] = seriesEvidence(frames.map(frame => frame.items[index].y));
    geometry[`item${index}.height`] = seriesEvidence(frames.map(frame => frame.items[index].height));
  }
  for (let index = 0; index < 4; index++) geometry[`gap${index}`] = seriesEvidence(frames.map(frame => frame.gaps[index]));
  for (const [key, value] of Object.entries(geometry)) {
    if (value.range <= 2) continue;
    assert.ok(value.distinct >= 5, `${label}: ${key} changed through only ${value.distinct} values`);
    assert.ok(value.largestStep <= Math.max(2, value.range * .45), `${label}: ${key} jumped ${value.largestStep.toFixed(2)}px within one frame over a ${value.range.toFixed(2)}px range`);
  }
  const fillColors = new Set(frames.map(frame => frame.fill)).size;
  if (checkColor && frames[0].fill !== frames.at(-1).fill) assert.ok(fillColors >= 5, `${label}: disc color changed without a continuous transition`);
  const last = frames.at(-1), recent = frames.filter(frame => frame.at > last.at - 150);
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(seriesEvidence(recent.map(frame => frame.rail[key])).range < .75, `${label}: rail has not settled`);
  return { frames: frames.length, geometry, fillColors, from: frames[0].rail, to: last.rail };
}
async function alignment(page) {
  const result = await page.evaluate(() => {
    const disc = document.querySelector('.groove-disc').getBoundingClientRect();
    const button = document.querySelector('.groove-item.active').getBoundingClientRect();
    const icon = document.querySelector('.groove-item.active .glyph').getBoundingClientRect();
    return { verticalError: Math.abs(disc.y + disc.height / 2 - button.y - button.height / 2), horizontalError: Math.abs(disc.x + disc.width / 2 - icon.x - icon.width / 2) };
  });
  assert.ok(result.verticalError < 1, `final vertical alignment error ${result.verticalError}`);
  assert.ok(result.horizontalError < 1.5, `final icon alignment error ${result.horizontalError}`);
  return result;
}

for (const { width, height, size } of [{ width: 390, height: 844, size: 'M' }, { width: 430, height: 932, size: 'M' }, { width: 320, height: 568, size: 'M' }, { width: 320, height: 568, size: 'L' }, { width: 1440, height: 900, size: 'M' }]) {
  await check(`${width}x${height} ${size} first town entry and return animate the global rail and item spacing continuously`, async () => {
    const page = await newPage(width, height, { size }), evidence = [];
    const previewZoom = await page.locator('.device-stage').evaluate(element => Number(getComputedStyle(element).zoom));
    if (width === 1440) assert.equal(previewZoom, .84, 'desktop test must exercise the CSS zoom coordinate conversion');
    for (const [label, screen] of [['古镇', 'town'], ['候车', 'ride']]) {
      const frames = await sample(page, [{ label, at: 0 }]);
      const animation = assertContinuous(frames, label);
      assert.equal(await page.locator('.mobile-main').getAttribute('data-screen'), screen);
      assert.equal(frames.at(-1).active, label);
      evidence.push({ label, previewZoom, ...animation, alignment: await alignment(page) });
      if (screen === 'town') await page.screenshot({ path: `${output}/${width}-${size}-town.png` });
    }
    return evidence;
  });
}

for (const [width, height] of [[390, 844], [320, 568], [1440, 900]]) {
  await check(`${width}px interrupted town to ride to town transition retains the same navigation and final target`, async () => {
    const page = await newPage(width, height);
    const previewZoom = await page.locator('.device-stage').evaluate(element => Number(getComputedStyle(element).zoom));
    if (width === 1440) assert.equal(previewZoom, .84, 'desktop test must exercise the CSS zoom coordinate conversion');
    const frames = await sample(page, [{ label: '古镇', at: 0 }, { label: '候车', at: 180 }, { label: '古镇', at: 340 }], 1700);
    const evidence = assertContinuous(frames, 'interrupted navigation');
    assert.ok(page.url().endsWith('/town'));
    assert.equal(await page.locator('.mobile-main').getAttribute('data-screen'), 'town');
    assert.equal(frames.at(-1).active, '古镇');
    return { previewZoom, ...evidence, alignment: await alignment(page) };
  });
}

for (const mode of ['system', 'preference']) {
  await check(`${mode} reduced motion settles global geometry and groove immediately`, async () => {
    const page = await newPage(320, 568, { system: mode === 'system', quiet: mode === 'preference' });
    const result = [];
    for (const [label, screen] of [['古镇', 'town'], ['候车', 'ride']]) {
      await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: label, exact: true }).click();
      await page.locator(`.mobile-main[data-screen=${screen}]`).waitFor();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const frames = await sample(page, [], 220);
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(seriesEvidence(frames.map(frame => frame.rail[key])).range < .75, `${mode}: ${key} animates after reduced-motion commit`);
      assert.ok(seriesEvidence(frames.map(frame => frame.cy)).range < .75, `${mode}: groove animates after reduced-motion commit`);
      assert.ok(frames.every(frame => frame.cy === frame.groove));
      result.push({ label, alignment: await alignment(page), rail: frames.at(-1).rail });
    }
    return result;
  });
}

checks.push({ name: 'Uncaught JavaScript errors', status: errors.length ? 'FAIL' : 'PASS', detail: errors }); names.push('Uncaught JavaScript errors');
await browser.close();
let merged = checks;
if (filter) {
  try {
    const previous = JSON.parse(await readFile(report, 'utf8')).checks.filter(check => names.includes(check.name));
    const rerun = new Map(checks.map(check => [check.name, check]));
    merged = previous.map(check => rerun.get(check.name) || check);
    merged.push(...checks.filter(check => !previous.some(prior => prior.name === check.name)));
  } catch { /* A filtered first run has no prior results to retain. */ }
}
await writeFile(report, JSON.stringify({ date: '2026-10-09', base, isolatedBrowserProfile: true, lastRun: { filter: process.env.NAV_LAYOUT_TEST_FILTER || null, checks: checks.map(check => check.name) }, checks: merged }, null, 2));
if (checks.some(check => check.status === 'FAIL')) process.exitCode = 1;
