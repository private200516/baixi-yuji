import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium, launchOptions } from './browser-runtime.mjs';

const root = resolve('dist');
const prefix = '/pages-project/';
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', mjs: 'text/javascript', json: 'application/json', geojson: 'application/geo+json', svg: 'image/svg+xml', woff2: 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
    const file = resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[file.split('.').at(-1)] || 'application/octet-stream' }).end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const base = `http://127.0.0.1:${server.address().port}${prefix}`;
  for (const screen of ['ride', 'return', 'scan', 'route', 'ticket', 'town', 'help', 'delay']) {
    await page.goto(`${base}#/${screen}`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.phone').waitFor();
    if (screen === 'town') {
      await page.locator('.village-pin').first().waitFor({ timeout: 30000 });
      assert.equal(await page.locator('.village-pin').count(), 5);
      assert.equal(await page.locator('.map-message').count(), 0);
      await page.getByLabel('选择古村', { exact: true }).selectOption('longgong');
      assert.equal(await page.locator('.town-village-card').getAttribute('data-village-id'), 'longgong');
    }
    assert.equal(await page.locator('.phone .font-options').count(), 0, `${screen}: text size lives in settings`);
    assert.match(await page.title(), /^乡序/);
    assert.ok(await page.getByRole('button', { name: '设置', exact: true }).count(), `${screen}: app rendered`);
    assert.ok(await page.evaluate(() => document.fonts.check('14px "Baixi Sans"')), `${screen}: local font loaded`);
    assert.deepEqual(errors, [], `${screen}: static assets resolve under a project subpath`);
  }
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '大字号', exact: true }).click();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('html').getAttribute('data-text-size'), 'L');
  await page.goto(`${base}#/town`);
  await page.getByLabel('选择古村', { exact: true }).selectOption('xujiashan');
  await page.locator('.town-route-action').click();
  await page.locator('.detail-stops').getByRole('button', { name: /龙宫村/ }).click();
  await page.waitForFunction(() => document.querySelector('.mobile-main')?.dataset.routeProposal === 'xujiashan-longgong');
  assert.match(await page.locator('.route-chips').textContent(), /41\.9 km/);
  await page.locator('.notch-action button').click();
  await page.locator('.screen-return').waitFor();
  assert.match(await page.locator('.return-stops').textContent(), /58\.2 km/);
  await page.locator('.notch-action button').click();
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('xiangxu.journey.v1') || '{}').savedPlan);
  await page.reload();
  await page.getByRole('button', { name: '查看本地计划', exact: true }).click();
  assert.match(await page.getByRole('dialog').textContent(), /龙宫村.*许家山村/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('xiangxu.journey.v1')).savedPlan);
  assert.equal(saved.routeProposalId, 'longgong-xujiashan');
  assert.equal(saved.direction, 'return');
  assert.equal(saved.operatingStatus, 'research-not-confirmed');
  assert.deepEqual(errors, [], 'research data and navigation work under a production project subpath');
  await mkdir('docs/journey-link', { recursive: true });
  await writeFile('docs/journey-link/production-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), status: 'PASS', screens: ['ride', 'return', 'scan', 'route', 'ticket', 'town', 'help', 'delay'], subpath: prefix, mapPoints: 5, selection: 'longgong', journey: { routeProposalId: saved.routeProposalId, direction: saved.direction, dataVersion: saved.dataVersion, restored: true }, errors }, null, 2));
  console.log('PASS production build: eight routes, map/font resources and the complete research-return-save-restore chain under a project subpath');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
