import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
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
      assert.equal(await page.locator('.landmark-description').getAttribute('data-village-id'), 'longgong');
    }
    assert.match(await page.title(), /^乡序/);
    assert.ok(await page.getByRole('button', { name: '设置', exact: true }).count(), `${screen}: app rendered`);
    assert.ok(await page.evaluate(() => document.fonts.check('14px "Baixi Sans"')), `${screen}: local font loaded`);
    assert.deepEqual(errors, [], `${screen}: static assets resolve under a project subpath`);
  }
  await writeFile('docs/map-only-production-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), status: 'PASS', screens: ['ride', 'return', 'scan', 'route', 'ticket', 'town', 'help', 'delay'], subpath: prefix, mapPoints: 5, selection: 'longgong', errors }, null, 2));
  console.log('PASS production build: original eight routes, local fonts, real map worker/data and village selection under a project subpath');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
