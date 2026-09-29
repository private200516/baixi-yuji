import { chromium, launchOptions, baseURL } from './browser-runtime.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ locale:'zh-CN', reducedMotion:'reduce' });
const page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
await mkdir('docs/mobile-screenshots', {recursive:true});
const sizes = [{width:390,height:844}, {width:320,height:568}, {width:360,height:740}, {width:430,height:932}, {width:1440,height:1050}, {width:1440,height:900}];
for (const viewport of sizes) {
  await page.setViewportSize(viewport);
  for (const screen of ['ride','return','scan','route','ticket','town','help','delay']) {
    await page.goto(`${baseURL}/#/${screen}`);
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => {
      const main = document.querySelector('.mobile-main').getBoundingClientRect();
      const teal = document.querySelector('.teal-content').getBoundingClientRect();
      const content = [...document.querySelector('.teal-content').children].map(el => ({name:el.className,rect:el.getBoundingClientRect()}));
      const overflow = content.filter(({rect}) => rect.bottom > teal.bottom + 2 || rect.right > teal.right + 2).map(x => x.name);
      return { docHeight:document.documentElement.scrollHeight, viewportHeight:innerHeight, docWidth:document.documentElement.scrollWidth, viewportWidth:innerWidth, mainBottom:main.bottom, tealHeight:teal.height, contentOverflow:overflow, railHeight:document.querySelector('.side-nav').clientHeight, navBottom:document.querySelector('.rail-buttons').getBoundingClientRect().bottom, lowerBottom:document.querySelector('.lower-landscape').getBoundingClientRect().bottom, fonts:document.fonts.check('900 16px "Baixi Sans"') && document.fonts.check('16px "Baixi Kai"') };
    });
    checks.push({viewport,screen,...layout});
    if ((viewport.width === 390 && ['ride','return','scan','town','help','ticket'].includes(screen)) || (viewport.width === 1440 && screen === 'ride') || (viewport.width === 320 && ['return','help'].includes(screen))) await page.screenshot({path:`docs/mobile-screenshots/${viewport.width}x${viewport.height}-${screen}.png`});
  }
}
await writeFile('docs/mobile-layout-check.json', JSON.stringify({errors,checks},null,2));
console.log(JSON.stringify({errors, issues:checks.filter(c => c.contentOverflow.length || c.docWidth>c.viewportWidth || (c.viewport.width<=520 && c.docHeight>c.viewportHeight) || c.navBottom>c.lowerBottom)},null,2));
await browser.close();
