import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, devices } from 'playwright';

const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = '.delivery/mobile-v222', reportPath = `${output}/mobile-startup-results.json`;
const filter = process.env.MOBILE_STARTUP_FILTER ? new RegExp(process.env.MOBILE_STARTUP_FILTER, 'i') : null;
const mobileFilm = await readFile('public/brand/nh-launch-mobile.mp4');
const checks = [], names = [], errors = [], captures = [], contexts = new Set();
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
async function check(name, run) {
  names.push(name); if (filter && !filter.test(name)) return;
  try { checks.push({ name, status: 'PASS', at: new Date().toISOString(), evidence: await run() }); }
  catch (error) {
    checks.push({ name, status: 'FAIL', at: new Date().toISOString(), detail: error.message });
    for (const context of contexts) for (const page of context.pages()) await page.screenshot({ path: `${output}/mobile-failure-${checks.length}.png`, scale: 'css' }).catch(() => {});
  } finally { await Promise.all([...contexts].map(context => context.close())); contexts.clear(); }
  console.log(`${checks.at(-1).status}: ${name}${checks.at(-1).detail ? '\n' + checks.at(-1).detail : ''}`);
  await writeFile(`${output}/mobile-startup-progress.json`, JSON.stringify({ at: new Date().toISOString(), checks }, null, 2));
}
async function create(device = 'iPhone 13', { slow = false, reject = false } = {}) {
  const { defaultBrowserType, ...emulation } = devices[device];
  const context = await browser.newContext({ ...emulation, locale: 'zh-CN', reducedMotion: 'no-preference' }); contexts.add(context);
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ slow, reject }) => {
    if (reject) HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Simulated mobile autoplay policy', 'NotAllowedError'));
    if (slow) document.addEventListener('loadedmetadata', event => {
      if (event.target instanceof HTMLVideoElement) { event.target.defaultPlaybackRate = .4; event.target.playbackRate = .4; }
    }, true);
    let simulatedHidden = false;
    // This exercises the app's visibility handlers; it is explicitly not a real
    // mobile OS suspension, background tab timer throttling or Safari run.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => simulatedHidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => simulatedHidden ? 'hidden' : 'visible' });
    window.__setTestVisibility = hidden => { simulatedHidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
    window.__mobileLaunch = { frames: [], events: [], doneAt: null };
    for (const type of ['playing', 'timeupdate', 'ended', 'error']) document.addEventListener(type, event => {
      if (event.target instanceof HTMLVideoElement) window.__mobileLaunch.events.push({ type, t: performance.now(), time: event.target.currentTime, duration: event.target.duration, trusted: event.isTrusted, hidden: document.hidden });
    }, true);
    function sample(t) {
      const app = document.querySelector('.launch-app'), mark = document.querySelector('.launch-fallback-mark'), video = document.querySelector('video');
      if (app) {
        window.__mobileLaunch.frames.push({ t, phase: app.dataset.launch, hidden: document.hidden, reason: app.dataset.launchReason || '',
          time: video?.currentTime ?? null, paused: video?.paused ?? null, clip: mark ? getComputedStyle(mark).clipPath : null,
          animationTime: mark?.getAnimations()[0]?.currentTime ?? null, inert: app.inert });
        if (app.dataset.launch === 'done') { window.__mobileLaunch.doneAt = t; return; }
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, { slow, reject });
  return { page, context, device };
}
async function load(page) { await page.goto(`${base}/#/ride`, { waitUntil: 'domcontentloaded' }); await page.locator('.launch-app').waitFor({ state: 'attached' }); }
async function done(page) {
  await page.locator('.launch-app[data-launch=done]').waitFor(); await page.waitForFunction(() => window.__mobileLaunch.doneAt !== null);
  assert.equal(await page.locator('.launch-app').evaluate(el => el.inert), false); assert.equal(await page.locator('.launch-screen').count(), 0);
  await page.waitForFunction(() => document.activeElement?.id === 'main-view');
}
async function state(page) { return page.evaluate(() => window.__mobileLaunch); }
async function snapshot(page, name) {
  const path = `${output}/${name}.png`; await page.screenshot({ path, scale: 'css' }); captures.push({ name, path, viewport: page.viewportSize(), at: new Date().toISOString() });
}
async function titleAndPoster(page) {
  assert.equal(await page.locator('.launch-wordmark strong').innerText(), '宁海公交');
  assert.equal(await page.locator('.launch-screen').getAttribute('aria-label'), '宁海公交启动动画');
  assert.equal(await page.locator('.launch-screen button,.launch-skip').count(), 0);
  const media = await page.locator('video').evaluate(async video => {
    const poster = new Image(); poster.src = video.poster; await poster.decode();
    return { poster: video.poster, decoded: poster.naturalWidth > 0, opacity: getComputedStyle(video).opacity, autoplay: video.autoplay, muted: video.muted,
      defaultMuted: video.defaultMuted, playsInline: video.playsInline, webkitInline: video.hasAttribute('webkit-playsinline'), currentTime: video.currentTime };
  });
  assert.ok(media.decoded && media.autoplay && media.muted && media.defaultMuted && media.playsInline && media.webkitInline); assert.equal(media.opacity, '1'); return media;
}
function natural(data) {
  const ended = data.events.find(event => event.type === 'ended' && event.trusted); assert.ok(ended, 'real media must end naturally');
  assert.ok(Math.abs(ended.duration - 4.041667) < .08); assert.ok(ended.time >= ended.duration - .05);
  assert.ok(!data.frames.some(frame => frame.phase === 'fallback'), 'slow successful playback must not invoke fallback'); return ended;
}
function fallbackVisibleTime(data) {
  let total = 0;
  for (let i = 0; i < data.frames.length - 1; i++) if (data.frames[i].phase === 'fallback' && !data.frames[i].hidden) total += data.frames[i + 1].t - data.frames[i].t;
  assert.ok(total >= 4000 && total < 4600, `fallback visible duration ${total}ms`);
  const variants = new Set(data.frames.filter(frame => frame.phase === 'fallback' && !frame.hidden).map(frame => frame.clip)).size;
  assert.ok(variants > 10); return { visibleDurationMs: total, distinctClipFrames: variants };
}

for (const device of ['iPhone 13', 'Pixel 7']) {
  await check(`${device} emulation: a 3.5s delayed first response still plays naturally and shows its poster`, async () => {
    const { page } = await create(device); const delayed = [];
    await page.route('**/brand/nh-launch-mobile.mp4*', async route => {
      const at = Date.now(); await new Promise(resolve => setTimeout(resolve, 3500)); delayed.push(Date.now() - at);
      await route.fulfill({ status: 200, contentType: 'video/mp4', body: mobileFilm }).catch(() => {});
    });
    await load(page); const media = await titleAndPoster(page);
    await page.waitForTimeout(1800); assert.equal(await page.locator('.launch-app').getAttribute('data-launch'), 'intro');
    assert.equal(await page.locator('video').evaluate(el => el.currentTime), 0); await snapshot(page, `${device.replaceAll(' ', '-')}-delayed-poster`);
    await done(page); const data = await state(page), ended = natural(data);
    assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'ended'); assert.ok(delayed.every(ms => ms >= 3490));
    return { emulation: device, browserEngine: 'Chromium / Edge', delayedResponseMs: delayed, media, ended, elapsedMs: data.doneAt - data.frames[0].t };
  });
  await check(`${device} emulation: continuous slow playback takes about 10s and is not timed out`, async () => {
    const { page } = await create(device, { slow: true }); await load(page); await titleAndPoster(page); await done(page);
    const data = await state(page), ended = natural(data), playing = data.events.find(event => event.type === 'playing' && event.trusted);
    assert.ok(playing); const duration = ended.t - playing.t; assert.ok(duration >= 9400 && duration < 12000, `slow playback duration ${duration}ms`);
    return { emulation: device, playbackRate: .4, trustedEnded: ended, naturalPlaybackMs: duration };
  });
}

await check('Autoplay rejection uses at least four seconds of animated NH fallback before revealing the app', async () => {
  const { page } = await create('iPhone 13', { reject: true }); await load(page);
  await page.locator('.launch-screen[data-phase=fallback]').waitFor(); await page.waitForTimeout(700); await snapshot(page, 'iPhone-autoplay-fallback-animation');
  assert.equal(await page.locator('.launch-wordmark strong').innerText(), '宁海公交'); assert.equal(await page.locator('.launch-screen button,.launch-skip').count(), 0);
  await done(page); const data = await state(page), fallback = fallbackVisibleTime(data);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'playback-blocked');
  return { simulatedFault: 'NotAllowedError from play()', fallback, elapsedMs: data.doneAt - data.frames[0].t };
});

await check('A decoded video that stops progressing uses the five-second stall budget then the full fallback', async () => {
  const { page } = await create('Pixel 7'); await load(page); await page.waitForFunction(() => document.querySelector('video')?.currentTime > .6);
  const stoppedAt = await page.evaluate(() => { const media = document.querySelector('video'); media.play = () => Promise.resolve(); media.pause(); return performance.now(); });
  await page.locator('.launch-screen[data-phase=fallback]').waitFor(); const dataAtFallback = await state(page);
  const fallbackAt = dataAtFallback.frames.find(frame => frame.phase === 'fallback')?.t || await page.evaluate(() => performance.now());
  assert.ok(fallbackAt - stoppedAt >= 4700 && fallbackAt - stoppedAt < 6000, `stall timeout ${fallbackAt - stoppedAt}ms`);
  await done(page); const data = await state(page); assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'media-timeout');
  return { simulatedFault: 'playback paused and retry play() cannot advance it', stallBudgetMs: fallbackAt - stoppedAt, fallback: fallbackVisibleTime(data) };
});

await check('Simulated hidden time does not consume the first-frame budget and resume still plays the full film', async () => {
  const { page } = await create('iPhone 13'); const held = [];
  await page.route('**/brand/nh-launch-mobile.mp4*', route => { held.push(route); });
  await load(page); await titleAndPoster(page); await page.waitForTimeout(650);
  const hiddenAt = await page.evaluate(() => { window.__setTestVisibility(true); return performance.now(); });
  await page.waitForTimeout(10500);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch'), 'intro'); assert.equal(await page.locator('video').evaluate(video => video.paused), true);
  const resumedAt = await page.evaluate(() => { window.__setTestVisibility(false); return performance.now(); }); await page.waitForTimeout(400);
  assert.equal(await page.locator('.launch-app').getAttribute('data-launch'), 'intro', 'hidden time was incorrectly charged on resume');
  await Promise.all(held.map(route => route.fulfill({ status: 200, contentType: 'video/mp4', body: mobileFilm }).catch(() => {})));
  await page.unroute('**/brand/nh-launch-mobile.mp4*'); await done(page);
  const data = await state(page), ended = natural(data); assert.equal(await page.locator('.launch-app').getAttribute('data-launch-reason'), 'ended');
  return { visibilityMethod: 'test-only document.hidden/visibilityState getters plus visibilitychange event; not OS backgrounding', hiddenMs: resumedAt - hiddenAt, ended, visibleTimePreserved: true };
});

await check('Simulated hidden state pauses the native fallback animation and preserves four visible seconds', async () => {
  const { page } = await create('Pixel 7', { reject: true }); await load(page); await page.locator('.launch-screen[data-phase=fallback]').waitFor(); await page.waitForTimeout(500);
  await page.evaluate(() => window.__setTestVisibility(true)); await page.waitForTimeout(150);
  const before = await page.locator('.launch-fallback-mark').evaluate(el => ({ clip: getComputedStyle(el).clipPath, time: el.getAnimations()[0].currentTime }));
  await page.waitForTimeout(5000);
  const after = await page.locator('.launch-fallback-mark').evaluate(el => ({ clip: getComputedStyle(el).clipPath, time: el.getAnimations()[0].currentTime }));
  assert.deepEqual(after, before); assert.equal(await page.locator('.launch-app').getAttribute('data-launch'), 'fallback');
  const resumedAt = await page.evaluate(() => { window.__setTestVisibility(false); return performance.now(); }); await done(page);
  const data = await state(page); assert.ok(data.doneAt - resumedAt >= 3800); const fallback = fallbackVisibleTime(data);
  return { visibilityMethod: 'simulated document visibility; native Web Animations currentTime observed', pausedBefore: before, pausedAfter: after, remainingAfterResumeMs: data.doneAt - resumedAt, fallback };
});

await check('A late hidden timeupdate does not double-credit the visible stall budget after resume', async () => {
  const { page } = await create('Pixel 7'); await load(page); await page.waitForFunction(() => document.querySelector('video')?.currentTime > .6);
  await page.evaluate(() => window.__setTestVisibility(true)); await page.waitForTimeout(3000);
  const late = await page.evaluate(() => { const video = document.querySelector('video'); video.currentTime += .1; video.dispatchEvent(new Event('timeupdate')); return { at: performance.now(), hidden: document.hidden, time: video.currentTime }; });
  await page.waitForTimeout(2000);
  const resumedAt = await page.evaluate(() => { const video = document.querySelector('video'); video.play = () => Promise.resolve(); window.__setTestVisibility(false); return performance.now(); });
  await page.locator('.launch-screen[data-phase=fallback]').waitFor({ timeout: 6500 });
  const enteredAt = await page.evaluate(() => performance.now()); assert.ok(enteredAt - resumedAt < 6000, `hidden progress caused ${enteredAt - resumedAt}ms stall budget`);
  await done(page); const data = await state(page);
  return { injectedLateHiddenTimeupdate: late, resumeToFallbackMs: enteredAt - resumedAt, fallback: fallbackVisibleTime(data), visibilityMethod: 'test-simulated late background media event' };
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
  } catch { /* First filtered run has no prior report. */ }
}
await writeFile(reportPath, JSON.stringify({ at: new Date().toISOString(), base, engine: 'Microsoft Edge / Chromium', emulationOnly: true,
  limits: ['Not tested on a physical iPhone or Android phone.', 'iPhone descriptor uses Chromium here, not Safari/WebKit.', 'Visibility tests simulate the document visibility API; they do not emulate OS background suspension or timer throttling.'],
  lastRun: { filter: process.env.MOBILE_STARTUP_FILTER || null, checks: checks.map(check => check.name) }, checks: merged, captures: allCaptures }, null, 2));
if (checks.some(check => check.status === 'FAIL')) process.exitCode = 1;
