import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = '.delivery/mobile-v222', reportPath = `${output}/startup-results.json`;
const filter = process.env.STARTUP_TEST_FILTER ? new RegExp(process.env.STARTUP_TEST_FILTER, 'i') : null;
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
  page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/brand\/nh-launch-mobile\.mp4(?:\?|$)/.test(request.url())) videoRequests.push(request.url()); });
  await page.addInitScript(({ size, quiet, senior, fault }) => {
    if (!sessionStorage.getItem('startup-test-seeded')) {
      localStorage.setItem('baixi.mobile.v2', JSON.stringify({ size, regularSize: 'M', quiet, senior, favorite: false, savedReturn: '18:00' }));
      sessionStorage.setItem('startup-test-seeded', 'true');
    }
    // Old releases remembered a completed launch. It must no longer suppress the film.
    sessionStorage.setItem('xiangxu.launch.nh.v1', 'seen');
    if (fault === 'play-rejection') HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Injected autoplay rejection', 'NotAllowedError'));
    if (fault === 'play-throw') HTMLMediaElement.prototype.play = () => { throw new DOMException('Injected synchronous autoplay rejection', 'NotAllowedError'); };
    if (fault === 'storage-writes') {
      window.__blockedStorageWrites = 0;
      Storage.prototype.setItem = () => { window.__blockedStorageWrites++; throw new DOMException('Injected unavailable storage', 'QuotaExceededError'); };
    }
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
          videoTime: video?.currentTime ?? null, duration: video?.duration ?? null, fallback: !!document.querySelector('.launch-fallback'),
          fallbackClip: document.querySelector('.launch-fallback-mark') ? getComputedStyle(document.querySelector('.launch-fallback-mark')).clipPath : null });
        if (app.dataset.launch === 'done') { window.__startupEvidence.doneAt = at; return; }
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, { size, quiet, senior, fault });
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
async function viewport(page, selectors = ['.launch-wordmark', '.launch-media']) {
  const result = await page.evaluate(selectors => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('horizontal document overflow');
    if (document.documentElement.scrollHeight > innerHeight + 1) issues.push('vertical document overflow');
    for (const selector of selectors) for (const element of document.querySelectorAll(selector)) {
      const r = element.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) issues.push(`${selector} outside viewport`);
    }
    return issues;
  }, selectors);
  assert.deepEqual(result, []); return result;
}
async function focusReleased(page) {
  await page.waitForFunction(() => document.activeElement?.id === 'main-view' || document.activeElement?.matches('.senior-heading h2'));
  assert.equal(await page.getByRole('button', { name: '设置', exact: true }).isEnabled(), true);
}
function animatedFallback(data) {
  const frames = data.frames.filter(frame => frame.phase === 'fallback');
  const end = data.frames.find(frame => frame.phase === 'revealing')?.at ?? data.doneAt;
  assert.ok(frames.length > 10, 'fallback must remain animated instead of flashing a static logo');
  const duration = end - frames[0].at;
  assert.ok(duration >= 4000 && duration < 4600, `fallback duration ${duration}ms`);
  assert.ok(new Set(frames.map(frame => frame.fallbackClip)).size > 10, 'fallback clip path has no intermediate animation frames');
  return { durationMs: duration, clipFrames: new Set(frames.map(frame => frame.fallbackClip)).size };
}

await check('390px natural MP4 playback advances to a trusted ended event, then crossfades into the app', async () => {
  const { page, videoRequests } = await create(); await load(page);
  assert.equal(await page.locator('.launch-app').evaluate(el => el.inert), true);
  assert.equal(await page.locator('.launch-app').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('.launch-wordmark strong').innerText(), '宁海公交');
  assert.equal(await page.locator('.launch-screen').getAttribute('aria-label'), '宁海公交启动动画');
  const attributes = await page.locator('video').evaluate(media => ({ autoplay: media.autoplay, muted: media.muted, defaultMuted: media.defaultMuted, playsInline: media.playsInline, inlineAttribute: media.hasAttribute('playsinline'), webkitInline: media.hasAttribute('webkit-playsinline'), poster: media.poster, source: media.currentSrc || media.src, opacity: getComputedStyle(media).opacity }));
  assert.ok(attributes.autoplay && attributes.muted && attributes.defaultMuted && attributes.playsInline && attributes.inlineAttribute && attributes.webkitInline);
  assert.ok(attributes.poster.endsWith('/brand/nh-launch-poster.svg')); assert.ok(attributes.source.endsWith('/brand/nh-launch-mobile.mp4')); assert.equal(attributes.opacity, '1');
  await page.waitForFunction(() => document.querySelector('.launch-video')?.currentTime > .4);
  assert.equal(await page.locator('.launch-screen button,.launch-skip').count(), 0);
  await page.keyboard.press('Tab'); assert.equal(await page.locator('.launch-screen').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Shift+Tab'); assert.equal(await page.locator('.launch-screen').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch'), 'intro', 'Escape must not skip the film');
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
    await done(page); await focusReleased(page);
    await viewport(page, ['.phone']); await screenshot(page, `${width}-${size}-home`);
    return { width, height, size, reason: await page.locator('.launch-app').getAttribute('data-launch-reason') };
  });
}

await check('Every full reload replays naturally while in-app navigation does not restart the film', async () => {
  const { page, videoRequests } = await create(); await load(page); await done(page); await focusReleased(page);
  assert.ok((await evidence(page)).events.some(event => event.type === 'ended' && event.trusted));
  const firstRequests = videoRequests.length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.launch-video')?.currentTime > .2);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch'), 'intro');
  assert.equal(await page.locator('.launch-app').evaluate(el => el.inert), true);
  await done(page); await focusReleased(page);
  assert.ok((await evidence(page)).events.some(event => event.type === 'ended' && event.trusted));
  assert.ok(videoRequests.length > firstRequests);
  const count = videoRequests.length;
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '古镇', exact: true }).click(); await page.locator('.mobile-main[data-screen=town]').waitFor();
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '候车', exact: true }).click(); await page.locator('.mobile-main[data-screen=ride]').waitFor();
  assert.equal(await page.locator('.launch-screen').count(), 0); assert.equal(videoRequests.length, count);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('baixi.mobile.v2')).savedReturn), '18:00');
  return { firstVideoRequests: firstRequests, requestsAfterReload: count, requestsAfterNavigation: videoRequests.length, legacySeenFlagIgnored: true };
});

await check('A town deep link survives the full film and Escape cannot skip the launch', async () => {
  const { page } = await create(); await load(page, 'town');
  await page.waitForFunction(() => document.querySelector('.launch-video')?.currentTime > .2);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch'), 'intro'); await done(page);
  assert.ok(page.url().endsWith('#/town')); await page.locator('.mobile-main[data-screen=town]').waitFor();
  await page.locator('.village-pin[aria-pressed=true]').waitFor({ timeout: 30000 }); await focusReleased(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'ended'); await screenshot(page, '390-deeplink-town');
  return { hash: '#/town', selectedVillage: await page.locator('.town-village-card').getAttribute('data-village-id') };
});

for (const mode of ['system', 'quiet', 'senior']) {
  await check(`${mode} reduced motion plays the full film and shortens only the final reveal`, async () => {
    const { page, videoRequests } = await create({ system: mode === 'system', quiet: mode === 'quiet', senior: mode === 'senior', size: mode === 'senior' ? 'L' : 'M' });
    await load(page); await page.waitForFunction(() => document.querySelector('.launch-video')?.currentTime > .3);
    assert.equal(await page.locator('.launch-app').getAttribute('data-launch'), 'intro');
    await done(page); await focusReleased(page);
    const data = await evidence(page), ended = data.events.find(event => event.type === 'ended' && event.trusted);
    assert.ok(ended, 'motion preferences must not skip the requested film'); assert.ok(ended.time >= ended.duration - .05);
    assert.ok(data.doneAt - ended.at < 300, 'reduced motion adds an animated exit');
    assert.equal(await page.locator('.launch-video,.launch-screen').count(), 0); assert.ok(videoRequests.length > 0);
    if (mode === 'senior') assert.equal(await page.locator('.senior-tasks button').count(), 4);
    else assert.equal(await page.getByRole('navigation', { name: '主要导航' }).getByRole('button').count(), 5);
    await screenshot(page, `390-${mode}-home`); return { videoRequests: videoRequests.length, ended, finalRevealMs: data.doneAt - ended.at, viewport: page.viewportSize() };
  });
}

await check('A failed MP4 request falls back to the logo and releases the app within a bounded time', async () => {
  const { page } = await create(); await page.route('**/brand/nh-launch-mobile.mp4*', route => route.abort('failed'));
  await load(page); await done(page); await focusReleased(page); const data = await evidence(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'media-error');
  assert.ok(data.frames.some(frame => frame.fallback && frame.phase === 'fallback'));
  const fallback = animatedFallback(data); assert.ok(data.doneAt - data.frames[0].at < 6500); await screenshot(page, '390-mp4-error-recovered');
  return { reason: 'media-error', fallback, releaseAfterMs: data.doneAt - data.frames[0].at };
});

await check('Rejected play promise falls back without an unhandled error or focus trap', async () => {
  const { page } = await create({ fault: 'play-rejection' }); await load(page); await done(page); await focusReleased(page); const data = await evidence(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'playback-blocked');
  const fallback = animatedFallback(data); assert.ok(data.doneAt - data.frames[0].at < 6500);
  return { reason: 'playback-blocked', fallback, releaseAfterMs: data.doneAt - data.frames[0].at };
});

await check('Synchronous play rejection also runs the complete fallback and restores interaction', async () => {
  const { page } = await create({ fault: 'play-throw' }); await load(page); await done(page); await focusReleased(page); const data = await evidence(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'playback-blocked');
  const fallback = animatedFallback(data); assert.ok(data.doneAt - data.frames[0].at < 6500);
  return { simulatedFault: 'synchronous NotAllowedError from play()', reason: 'playback-blocked', fallback, releaseAfterMs: data.doneAt - data.frames[0].at };
});

await check('Unavailable storage writes cannot suppress the film or trap the revealed app', async () => {
  const { page } = await create({ fault: 'storage-writes' }); await load(page); await done(page); await focusReleased(page);
  const data = await evidence(page), ended = data.events.find(event => event.type === 'ended' && event.trusted);
  assert.ok(ended); assert.ok(ended.time >= ended.duration - .05);
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('dialog', { name: '设置', exact: true }).waitFor();
  await page.getByRole('button', { name: '大字号', exact: true }).click();
  const blockedStorageWrites = await page.evaluate(() => window.__blockedStorageWrites); assert.ok(blockedStorageWrites > 0, 'storage fault was not exercised');
  assert.equal(await page.locator('html').getAttribute('data-text-size'), 'L');
  return { simulatedFault: 'QuotaExceededError on Storage.setItem', blockedStorageWrites, trustedEnded: ended, settingsOpened: true, inMemorySizeChanged: 'L' };
});

await check('A hung video request cannot hold the app beyond the no-progress watchdog', async () => {
  const { page } = await create(); let held;
  await page.route('**/brand/nh-launch-mobile.mp4*', route => { held = route; });
  await load(page); await done(page); await focusReleased(page); const data = await evidence(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'media-timeout');
  const elapsed = data.doneAt - data.frames[0].at; assert.ok(elapsed >= 14000 && elapsed < 17000, `hung request held app for ${elapsed}ms`);
  const fallback = animatedFallback(data); await held?.abort().catch(() => {});
  return { reason: 'media-timeout', releaseAfterMs: elapsed, fallback };
});

await check('Progress without an ended event still respects the absolute startup deadline', async () => {
  const { page } = await create({ fault: 'endless-progress' }); const held = [];
  // Prevent native autoplay from finishing the real film while simulating a
  // defective player that reports progress forever without an ended event.
  await page.route('**/brand/nh-launch-mobile.mp4*', route => { held.push(route); });
  await load(page); await done(page); await focusReleased(page); const data = await evidence(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'media-timeout');
  const elapsed = data.doneAt - data.frames[0].at; assert.ok(elapsed >= 24000 && elapsed < 28000, `absolute deadline failed: ${elapsed}ms`);
  assert.ok(data.events.filter(event => event.type === 'timeupdate').length >= 25);
  const fallback = animatedFallback(data); await Promise.all(held.map(route => route.abort().catch(() => {})));
  return { simulatedFault: 'advancing media time with no ended event', releaseAfterMs: elapsed, reason: 'media-timeout', fallback };
});

await check('A second tab in the same browser context also plays the film to completion', async () => {
  const { page, context } = await create(); await load(page); await done(page);
  const next = await context.newPage(); next.on('pageerror', error => errors.push(error.message));
  await next.addInitScript(() => {
    window.__secondTabEnded = null;
    document.addEventListener('ended', event => {
      if (event.target instanceof HTMLVideoElement) window.__secondTabEnded = { trusted: event.isTrusted, time: event.target.currentTime, duration: event.target.duration };
    }, true);
  });
  await next.goto(`${base}/#/ride`, { waitUntil: 'domcontentloaded' });
  await next.waitForFunction(() => document.querySelector('.launch-video')?.currentTime > .3);
  assert.equal(await next.locator('.launch-app').evaluate(el => el.inert), true);
  await next.locator('.launch-app[data-launch=done]').waitFor();
  const ended = await next.evaluate(() => window.__secondTabEnded); assert.ok(ended?.trusted);
  await focusReleased(next); return { completedTabs: 2, ended };
});

await check('Enabling OS reduced motion during playback does not interrupt the film', async () => {
  const { page } = await create(); await load(page); await page.waitForFunction(() => document.querySelector('.launch-video')?.currentTime > .2);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(200);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch'), 'intro');
  await done(page); await focusReleased(page);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'ended');
  const data = await evidence(page), ended = data.events.find(event => event.type === 'ended' && event.trusted);
  assert.ok(ended); assert.ok(data.doneAt - ended.at < 300);
  return { reason: 'ended', fullFilmPlayed: true, finalRevealMs: data.doneAt - ended.at };
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
