import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = '.delivery/nh-launch', reportPath = `${output}/test-results.json`;
const filter = process.env.STARTUP_TEST_FILTER ? new RegExp(process.env.STARTUP_TEST_FILTER, 'i') : null;
const launchKey = 'xiangxu.launch.nh.v1';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const checks = [], names = [], errors = [], captures = [], contexts = new Set();
await mkdir(output, { recursive: true });

async function check(name, run) {
  names.push(name); if (filter && !filter.test(name)) return;
  try { checks.push({ name, status: 'PASS', at: new Date().toISOString(), evidence: await run() }); }
  catch (error) {
    checks.push({ name, status: 'FAIL', at: new Date().toISOString(), detail: error.message });
    for (const context of contexts) for (const [index, page] of context.pages().entries()) {
      await page.screenshot({ path: `${output}/failure-${checks.length}-${index}.png` }).catch(() => {});
    }
  } finally { await Promise.all([...contexts].map(context => context.close())); contexts.clear(); }
  console.log(`${checks.at(-1).status}: ${name}${checks.at(-1).detail ? '\n' + checks.at(-1).detail : ''}`);
}
async function create({ width = 390, height = 844, size = 'M', quiet = false, senior = false, system = false, fault = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN', reducedMotion: system ? 'reduce' : 'no-preference' });
  contexts.add(context);
  const page = await context.newPage(), videoRequests = [];
  page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/brand\/nh-launch\.mp4(?:\?|$)/.test(request.url())) videoRequests.push(request.url()); });
  await page.addInitScript(({ size, quiet, senior, fault, launchKey }) => {
    if (!sessionStorage.getItem('startup-test-seeded')) {
      localStorage.setItem('baixi.mobile.v2', JSON.stringify({ size, regularSize: 'M', quiet, senior, favorite: false, savedReturn: '18:00' }));
      sessionStorage.setItem('startup-test-seeded', 'true');
    }
    if (fault === 'storage') {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === launchKey) throw new DOMException('Injected session write failure', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    }
    if (fault === 'play-rejection') HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Injected autoplay rejection', 'NotAllowedError'));
    if (fault === 'endless-progress') {
      const started = new WeakMap();
      HTMLMediaElement.prototype.play = function() {
        if (!started.has(this)) {
          const start = performance.now(); started.set(this, start);
          Object.defineProperty(this, 'currentTime', { configurable: true, get: () => (performance.now() - start) / 1000 });
          setInterval(() => this.dispatchEvent(new Event('timeupdate')), 180);
        }
        return Promise.resolve();
      };
    }
    window.__startupEvidence = { events: [], frames: [], doneAt: null };
    for (const type of ['playing', 'timeupdate', 'ended', 'error']) document.addEventListener(type, event => {
      if (event.target instanceof HTMLVideoElement) window.__startupEvidence.events.push({ type, at: performance.now(), time: event.target.currentTime, duration: event.target.duration, trusted: event.isTrusted });
    }, true);
    function sample(at) {
      const app = document.querySelector('.launch-app'), overlay = document.querySelector('.launch-screen'), video = document.querySelector('.launch-video');
      if (app) {
        window.__startupEvidence.frames.push({ at, phase: app.dataset.launch, reason: app.dataset.launchReason || '', appOpacity: +getComputedStyle(app).opacity,
          overlayOpacity: overlay ? +getComputedStyle(overlay).opacity : null, inert: app.inert, ariaHidden: app.getAttribute('aria-hidden'),
          videoTime: video?.currentTime ?? null, duration: video?.duration ?? null, fallback: !!document.querySelector('.launch-fallback') });
        if (app.dataset.launch === 'done') { window.__startupEvidence.doneAt = at; return; }
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, { size, quiet, senior, fault, launchKey });
  return { page, context, videoRequests };
}
async function load(page, screen = 'ride') { await page.goto(`${base}/#/${screen}`, { waitUntil: 'domcontentloaded' }); await page.locator('.launch-app').waitFor({ state: 'attached' }); }
async function done(page) {
  await page.locator('.launch-app[data-launch=done]').waitFor();
  await page.locator('.launch-screen').waitFor({ state: 'detached' });
  await page.waitForFunction(() => window.__startupEvidence.doneAt !== null);
  assert.equal(await page.locator('.launch-app').evaluate(el => el.inert), false);
  assert.equal(await page.locator('.launch-app').getAttribute('aria-hidden'), null);
}
async function evidence(page) { return page.evaluate(() => window.__startupEvidence); }
async function screenshot(page, name) {
  const path = `${output}/${name}.png`; await page.screenshot({ path }); captures.push({ name, path, at: new Date().toISOString(), viewport: page.viewportSize() });
}
async function viewport(page, selectors = ['.launch-wordmark', '.launch-media', '.launch-skip']) {
  const result = await page.evaluate(selectors => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('horizontal document overflow');
    if (document.documentElement.scrollHeight > innerHeight + 1) issues.push('vertical document overflow');
    for (const selector of selectors) for (const element of document.querySelectorAll(selector)) {
      const r = element.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) issues.push(`${selector} outside viewport`);
    }
    const button = document.querySelector('.launch-skip');
    if (button) { const r = button.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); if (!hit || !button.contains(hit)) issues.push('skip button is covered'); }
    return issues;
  }, selectors);
  assert.deepEqual(result, []); return result;
}
async function focusReleased(page) {
  await page.waitForFunction(() => document.activeElement?.id === 'main-view');
  assert.equal(await page.getByRole('button', { name: '设置', exact: true }).isEnabled(), true);
}

await check('390px natural MP4 playback advances to a trusted ended event, then crossfades into the app', async () => {
  const { page, videoRequests } = await create(); await load(page);
  assert.equal(await page.locator('.launch-app').evaluate(el => el.inert), true);
  assert.equal(await page.locator('.launch-app').getAttribute('aria-hidden'), 'true');
  await page.waitForFunction(() => document.querySelector('.launch-video')?.currentTime > .4);
  await page.keyboard.press('Tab'); assert.equal(await page.locator('.launch-skip').evaluate(el => el === document.activeElement), true);
  await viewport(page); await screenshot(page, '390-natural-playing');
  await page.waitForFunction(() => {
    const overlay = document.querySelector('.launch-screen');
    return overlay?.getAttribute('data-phase') === 'revealing' && +getComputedStyle(overlay).opacity < .7;
  });
  await screenshot(page, '390-natural-crossfade'); await done(page); await focusReleased(page); await screenshot(page, '390-natural-home');
  const data = await evidence(page), ended = data.events.find(event => event.type === 'ended');
  assert.ok(ended?.trusted, 'completion must come from a real browser ended event');
  assert.ok(Math.abs(ended.duration - 4.041667) < .08, `unexpected film duration ${ended.duration}`);
  assert.ok(ended.time >= ended.duration - .05);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'ended');
  const played = data.events.filter(event => event.type === 'timeupdate' && event.trusted);
  assert.ok(played.length >= 5); assert.ok(played.at(-1).time - played[0].time > 2.5);
  const crossfade = data.frames.filter(frame => frame.phase === 'revealing');
  assert.ok(crossfade.filter(frame => frame.overlayOpacity > .02 && frame.overlayOpacity < .98).length >= 3);
  assert.ok(crossfade.filter(frame => frame.appOpacity > .02 && frame.appOpacity < .98).length >= 3);
  assert.ok(crossfade.every(frame => frame.inert && frame.ariaHidden === 'true'));
  const revealDuration = data.doneAt - crossfade[0].at; assert.ok(revealDuration > 550 && revealDuration < 1000, `unexpected reveal duration ${revealDuration}`);
  return { requests: videoRequests.length, ended, trustedTimeUpdates: played.length, crossfadeFrames: crossfade.length, revealDurationMs: revealDuration, focus: 'main-view' };
});

for (const [width, height, size] of [[320, 568, 'L'], [1440, 900, 'M']]) {
  await check(`${width}px ${size} startup and revealed page stay inside the viewport`, async () => {
    const { page } = await create({ width, height, size }); await load(page);
    await page.waitForFunction(() => document.querySelector('.launch-video')?.currentTime > .3);
    await viewport(page); await screenshot(page, `${width}-${size}-intro`);
    assert.equal(await page.locator('html').getAttribute('data-text-size'), size);
    await page.getByRole('button', { name: '跳过动画', exact: false }).click(); await done(page); await focusReleased(page);
    await viewport(page, ['.phone']); await screenshot(page, `${width}-${size}-home`);
    return { width, height, size, reason: await page.locator('.launch-app').getAttribute('data-launch-reason') };
  });
}

await check('Skip releases focus and a completed tab session does not replay on reload or navigation', async () => {
  const { page, videoRequests } = await create(); await load(page); await page.locator('.launch-skip').click(); await done(page); await focusReleased(page);
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), launchKey), 'seen');
  const count = videoRequests.length;
  await page.reload({ waitUntil: 'domcontentloaded' }); await done(page); assert.equal(await page.locator('.launch-video').count(), 0); assert.equal(videoRequests.length, count);
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '古镇', exact: true }).click(); await page.locator('.mobile-main[data-screen=town]').waitFor();
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '候车', exact: true }).click(); await page.locator('.mobile-main[data-screen=ride]').waitFor();
  assert.equal(await page.locator('.launch-screen').count(), 0); assert.equal(videoRequests.length, count);
  return { initialVideoRequests: count, requestsAfterReloadAndNavigation: videoRequests.length, completedSession: true };
});

await check('A town deep link survives startup and Escape uses the existing skip route', async () => {
  const { page } = await create(); await load(page, 'town'); await page.locator('.launch-skip').waitFor(); await page.keyboard.press('Escape'); await done(page);
  assert.ok(page.url().endsWith('#/town')); await page.locator('.mobile-main[data-screen=town]').waitFor();
  await page.locator('.village-pin[aria-pressed=true]').waitFor({ timeout: 30000 }); await focusReleased(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'skipped'); await screenshot(page, '390-deeplink-town');
  return { hash: '#/town', selectedVillage: await page.locator('.town-village-card').getAttribute('data-village-id') };
});

for (const mode of ['system', 'quiet', 'senior']) {
  await check(`${mode} reduced motion opens the app without creating or requesting the video`, async () => {
    const { page, videoRequests } = await create({ system: mode === 'system', quiet: mode === 'quiet', senior: mode === 'senior', size: mode === 'senior' ? 'L' : 'M' });
    await load(page); await done(page); await page.waitForTimeout(250);
    assert.equal(await page.locator('.launch-video,.launch-screen').count(), 0); assert.equal(videoRequests.length, 0);
    if (mode === 'senior') assert.equal(await page.locator('.senior-tasks button').count(), 4);
    else assert.equal(await page.getByRole('navigation', { name: '主要导航' }).getByRole('button').count(), 5);
    await screenshot(page, `390-${mode}-direct-home`); return { videoRequests: 0, videoElements: 0, viewport: page.viewportSize() };
  });
}

await check('A failed MP4 request falls back to the logo and releases the app within a bounded time', async () => {
  const { page } = await create(); await page.route('**/brand/nh-launch.mp4*', route => route.abort('failed'));
  await load(page); await done(page); await focusReleased(page); const data = await evidence(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'media-error');
  assert.ok(data.frames.some(frame => frame.fallback && frame.phase === 'fallback'));
  assert.ok(data.doneAt - data.frames[0].at < 2300); await screenshot(page, '390-mp4-error-recovered');
  return { reason: 'media-error', fallbackShown: true, releaseAfterMs: data.doneAt - data.frames[0].at };
});

await check('Rejected play promise falls back without an unhandled error or focus trap', async () => {
  const { page } = await create({ fault: 'play-rejection' }); await load(page); await done(page); await focusReleased(page); const data = await evidence(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'playback-blocked');
  assert.ok(data.frames.some(frame => frame.fallback)); assert.ok(data.doneAt - data.frames[0].at < 2300);
  return { reason: 'playback-blocked', releaseAfterMs: data.doneAt - data.frames[0].at };
});

await check('A hung video request cannot hold the app beyond the no-progress watchdog', async () => {
  const { page } = await create(); let held;
  await page.route('**/brand/nh-launch.mp4*', route => { held = route; });
  await load(page); await done(page); await focusReleased(page); const data = await evidence(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'media-timeout');
  const elapsed = data.doneAt - data.frames[0].at; assert.ok(elapsed >= 2600 && elapsed < 4500, `hung request held app for ${elapsed}ms`);
  assert.ok(data.frames.some(frame => frame.fallback)); await held?.abort().catch(() => {});
  return { reason: 'media-timeout', releaseAfterMs: elapsed, fallbackShown: true };
});

await check('Progress without an ended event still respects the absolute startup deadline', async () => {
  const { page } = await create({ fault: 'endless-progress' }); await load(page); await done(page); await focusReleased(page); const data = await evidence(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'media-timeout');
  const elapsed = data.doneAt - data.frames[0].at; assert.ok(elapsed >= 8500 && elapsed < 10500, `absolute deadline failed: ${elapsed}ms`);
  assert.ok(data.events.filter(event => event.type === 'timeupdate').length >= 25);
  return { simulatedFault: 'advancing media time with no ended event', releaseAfterMs: elapsed, reason: 'media-timeout' };
});

await check('Session storage write failure cannot prevent skip, app access or in-memory no-replay', async () => {
  const { page, videoRequests } = await create({ fault: 'storage' }); await load(page); await page.locator('.launch-skip').click(); await done(page); await focusReleased(page);
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), launchKey), null);
  const initialRequests = videoRequests.length;
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '返程', exact: true }).click(); await page.locator('.mobile-main[data-screen=return]').waitFor();
  assert.equal(await page.locator('.launch-screen').count(), 0); assert.equal(videoRequests.length, initialRequests);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('baixi.mobile.v2')).savedReturn), '18:00');
  return { sessionWriteRejected: true, reason: await page.locator('.launch-app').getAttribute('data-launch-reason'), replayedDuringNavigation: false };
});

await check('Enabling OS reduced motion during playback immediately releases the app', async () => {
  const { page } = await create(); await load(page); await page.waitForFunction(() => document.querySelector('.launch-video')?.currentTime > .2);
  const started = Date.now(); await page.emulateMedia({ reducedMotion: 'reduce' }); await done(page); await focusReleased(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'reduced-motion');
  assert.ok(Date.now() - started < 550); return { reason: 'reduced-motion', releaseAfterMs: Date.now() - started };
});

checks.push({ name: 'No uncaught JavaScript errors', status: errors.length ? 'FAIL' : 'PASS', at: new Date().toISOString(), evidence: errors }); names.push('No uncaught JavaScript errors');
await browser.close();
let merged = checks, allCaptures = captures;
if (filter) {
  try {
    const previous = JSON.parse(await readFile(reportPath, 'utf8')), current = new Map(checks.map(check => [check.name, check]));
    merged = previous.checks.filter(check => names.includes(check.name)).map(check => current.get(check.name) || check);
    merged.push(...checks.filter(check => !merged.some(prior => prior.name === check.name)));
    allCaptures = previous.captures.filter(capture => !captures.some(current => current.path === capture.path)).concat(captures);
  } catch { /* First selective execution has no previous report to merge. */ }
}
await writeFile(reportPath, JSON.stringify({ at: new Date().toISOString(), base, isolatedBrowserProfile: true, lastRun: { filter: process.env.STARTUP_TEST_FILTER || null, checks: checks.map(check => check.name) }, checks: merged, captures: allCaptures }, null, 2));
if (checks.some(check => check.status === 'FAIL')) process.exitCode = 1;
