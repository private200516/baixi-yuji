import { chromium, launchOptions, baseURL } from './browser-runtime.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const output = path.resolve('docs/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
const page = await context.newPage();
const errors = [], externals = [], missing = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (!request.url().startsWith(baseURL) && !request.url().startsWith('data:')) externals.push(request.url()); });
page.on('response', response => { if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`); });
async function check(name, run) { await run(); checks.push({ name, result: 'PASS' }); console.log(`PASS ${name}`); }
async function dismiss() { const close = page.getByRole('button', { name: '关闭状态提示' }); if (await close.count()) await close.click(); }
async function font(name) { await page.getByRole('button', { name, exact: true }).click(); await dismiss(); }
async function fits() {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.width, `Horizontal overflow: ${JSON.stringify(dimensions)}`);
}
async function capture(name) {
  await page.evaluate(async () => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
  await page.screenshot({ path: path.join(output, `${name}-viewport.png`), animations: 'disabled' });
}
try {
  await page.goto(baseURL);
  await page.getByRole('heading', { name: /下一站，\s*前童古镇。/ }).waitFor();
  await check('方向同步更新站序、目的地、班次、回程', async () => {
    await page.getByRole('button', { name: '回城区', exact: true }).click();
    assert.equal(await page.locator('.station-sheet h2').textContent(), '前童古镇接驳点（示例）');
    assert.equal(await page.locator('.departure-time time').textContent(), '10:30');
    assert.match(await page.locator('.return-summary').textContent(), /15:00/);
    await page.getByRole('button', { name: '去古镇', exact: true }).click();
    await dismiss();
  });
  await check('收藏可取消，刷新后保持', async () => {
    await page.getByRole('button', { name: '收藏此线路' }).click();
    await page.reload();
    await page.getByRole('button', { name: '已收藏 · 取消' }).click();
    await page.reload();
    assert.equal(await page.getByRole('button', { name: '收藏此线路' }).getAttribute('aria-pressed'), 'false');
  });
  await check('站点详情、真实边界文案、Esc和焦点返回', async () => {
    const trigger = page.getByRole('button', { name: '去上车点', exact: true });
    await trigger.click();
    assert.equal(await page.getByRole('dialog').isVisible(), true);
    await page.getByText('站台照片待采集', { exact: true }).waitFor();
    await page.getByText('暂未接入步行导航', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
  });
  await check('路由直达、返回、前进与待开发说明', async () => {
    await page.locator('.right-rail').getByRole('link', { name: '古镇', exact: true }).click();
    await page.getByText('阶段 A · 待开发').waitFor();
    await page.goBack();
    await page.locator('.station-sheet').waitFor();
    await page.goForward();
    await page.getByRole('heading', { name: '古镇', exact: true }).waitFor();
    await page.goto(`${baseURL}/#/return`);
    await page.getByText('回程信息，先看一眼。').waitFor();
    await page.getByRole('link', { name: '返回乘车首页' }).click();
  });
  await check('390标准版实际页面截图', async () => {
    await capture('mobile-390-standard');
  });
  await check('大字刷新后保持与右侧面板键盘焦点', async () => {
    await font('大字');
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-font-size'), 'large');
    const toggle = page.getByRole('button', { name: '导航', exact: true });
    await toggle.click();
    assert.equal(await page.getByRole('dialog').isVisible(), true);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('dialog')), true);
    }
    await page.keyboard.press('Escape');
    assert.equal(await toggle.evaluate(element => element === document.activeElement), true);
    await capture('mobile-390-large');
  });
  await check('320/360/390/768/1440/1920正常和大字均无横向溢出', async () => {
    for (const width of [320, 360, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['标准', '大字']) { await font(mode); await fits(); }
    }
  });
  await check('1440桌面实际页面截图', async () => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await font('标准');
    await capture('desktop-1440');
  });
  await check('右侧导航等宽且选中后位置不变，功能在同一曲面内切换', async () => {
    const before = await page.locator('.right-rail nav a').evaluateAll(elements => elements.map(element => ({ x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width })));
    await page.locator('.right-rail').getByRole('link', { name: '返程', exact: true }).click();
    await page.getByText('回程信息，先看一眼。').waitFor();
    const after = await page.locator('.right-rail nav a').evaluateAll(elements => elements.map(element => ({ x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width })));
    assert.deepEqual(after, before);
    assert.equal(await page.locator('.curve-surface').count(), 1);
    await capture('desktop-1440-return-panel');
    await page.goto(baseURL);
  });
  await check('减少动态效果偏好关闭动画，内容和方向仍可操作', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    assert.equal(await page.locator('.curve-surface').evaluate(element => getComputedStyle(element).animationName), 'none');
    await page.getByRole('button', { name: '回城区', exact: true }).click();
    assert.equal(await page.locator('.departure-time time').textContent(), '10:30');
    await page.getByRole('button', { name: '去古镇', exact: true }).click();
    await dismiss();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
  await check('320有效宽度，200%文字放大仍可重排', async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    await fits();
    await page.evaluate(() => document.documentElement.style.fontSize = '');
  });
  await check('短屏导航可访问与长站名换行', async () => {
    await page.setViewportSize({ width: 390, height: 400 });
    await page.locator('.right-rail').getByRole('link', { name: '帮助', exact: true }).click();
    await page.getByRole('heading', { name: '帮助', exact: true }).waitFor();
    await page.goto(baseURL);
    await page.locator('.station-sheet h2').evaluate(element => element.textContent = '宁海城区综合公共交通换乘中心东侧候车站点（超长站名测试示例）');
    await fits();
  });
  await check('损坏存储和不可写存储不崩溃、不报假成功', async () => {
    await page.evaluate(() => localStorage.setItem('baixi-yuji.preferences.v1', '{broken'));
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-font-size'), 'standard');
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'QuotaExceededError'); }; });
    await page.getByRole('button', { name: '收藏此线路' }).click();
    await page.getByRole('status').getByText(/本地保存失败/).waitFor();
  });
  await check('候选LOGO三套本地资源与24/32/48px校样', async () => {
    await page.setViewportSize({ width: 900, height: 620 });
    await page.goto(`${baseURL}/brand/preview.html`);
    assert.equal(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
    await page.screenshot({ path: path.join(output, 'logo-sizes.png'), fullPage: true });
  });
  await check('无浏览器错误、资源缺失或外部应用请求', async () => {
    assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.deepEqual(externals, []);
  });
} catch (error) {
  checks.push({ name: 'Browser run', result: 'FAIL', reason: error.message });
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile('docs/browser-results.json', JSON.stringify({ browser: browser.version(), baseURL, checks, errors, missing, externals }, null, 2));
  await browser.close();
}
