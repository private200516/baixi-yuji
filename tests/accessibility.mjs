import { chromium, launchOptions, baseURL } from './browser-runtime.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const issues = [], checks = [];
page.on('pageerror', e => issues.push(e.message));
const load = async (screen = 'ride') => { await page.goto(`${baseURL}/#/${screen}`); await page.evaluate(() => document.fonts.ready); };
const settings = () => page.getByRole('button', { name: '设置', exact: true }).click();
const close = () => page.getByRole('button', { name: '关闭弹窗' }).click();
async function sizes(selector) {
  return page.locator(selector).evaluateAll(elements => elements.filter(el => el.getClientRects().length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(el => ({ text: [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(), size: parseFloat(getComputedStyle(el).fontSize) })));
}
function compare(a,b,label) {
  assert.equal(a.length,b.length,`${label}: text count`);
  a.forEach((v,i) => { assert.equal(v.text,b[i].text,`${label}: same text`); assert.ok(b[i].size > v.size + .1,`${label}: ${v.text} did not grow (${v.size} → ${b[i].size})`); });
}
async function layout(label, senior = false) {
  const result = await page.evaluate(senior => {
    const problems=[];
    if(document.documentElement.scrollHeight>innerHeight+1)problems.push('page vertical scroll');
    if(document.documentElement.scrollWidth>innerWidth+1)problems.push('page horizontal scroll');
    if(senior) {
      const main=document.querySelector('.senior-main'), frame=main.getBoundingClientRect();
      const children=[...main.children].filter(el=>el.getBoundingClientRect().height);
      children.forEach((el,i)=>{const r=el.getBoundingClientRect();if(r.bottom>frame.bottom+2)problems.push(`${el.className} outside main`);if(i&&r.top<children[i-1].getBoundingClientRect().bottom-1)problems.push(`${el.className} overlaps previous`);});
      for(const el of main.querySelectorAll('button')){const r=el.getBoundingClientRect();if(r.width<44||r.height<44)problems.push(`small target ${el.textContent}: ${r.width}x${r.height}`);}
      for(const el of main.querySelectorAll('*')) {
        if(!el.getClientRects().length||el.closest('svg'))continue;
        for(const node of el.childNodes){if(node.nodeType!==3||!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);const r=range.getBoundingClientRect(), p=el.getBoundingClientRect();if(r.width&& (r.right>p.right+2||r.bottom>p.bottom+3||r.top<p.top-3))problems.push(`text outside ${el.className||el.tagName}: ${node.textContent}`);}
      }
    } else {
      const action=document.querySelector('.notch-action button').getBoundingClientRect(), card=document.querySelector('.return-mini').getBoundingClientRect();
      if(action.bottom+3>card.top)problems.push('primary action overlaps return card');
      const title=document.querySelector('.hero-title').getBoundingClientRect(),cap=document.querySelector('.sculpt-frame').getBoundingClientRect();
      if(title.bottom+3>cap.top)problems.push('headline overlaps curved panel');
    }
    return problems;
  },senior);
  issues.push(...result.map(s=>`${label}: ${s}`));
}
try {
  for(const screen of ['ride','return','scan','route','ticket','town','help','delay']) {
    await load(screen);
    const sampled=[];
    for(const name of ['小字号','中字号','大字号']) { await page.getByRole('button',{name,exact:true}).click(); sampled.push(await sizes('.phone *')); }
    compare(sampled[0],sampled[1],`${screen} S/M`);compare(sampled[1],sampled[2],`${screen} M/L`);
  }
  checks.push('All visible text grows across all 8 normal screens; typography keeps the same content');
  await settings(); const modalSizes=[];
  for(const name of ['小字号','中字号','大字号']) {await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();modalSizes.push(await sizes('dialog *'));}
  compare(modalSizes[0],modalSizes[1],'settings S/M');compare(modalSizes[1],modalSizes[2],'settings M/L');
  await page.getByRole('dialog').getByRole('button',{name:'中字号',exact:true}).click();
  await page.getByRole('switch',{name:'老年人模式'}).click();
  assert.equal(await page.locator('.senior-main').count(),1);assert.equal(await page.locator('.groove-nav').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.textSize),'L');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.motion),'reduced');
  await page.reload(); await page.locator('.senior-main').waitFor();
  checks.push('Mode and typography persist; large text and reduced motion apply automatically');
  await page.getByRole('button',{name:'换个车站',exact:true}).click();
  await page.getByRole('button',{name:'东湖站',exact:true}).click();
  await page.getByRole('button',{name:'关闭提示'}).click();
  assert.equal(await page.locator('.senior-boarding h3').textContent(),'东湖站');
  await page.getByRole('button',{name:'看返程',exact:true}).click();
  await page.getByRole('button',{name:'换个时间',exact:true}).click();
  await page.getByRole('button',{name:'18:00',exact:true}).click();
  await page.getByRole('button',{name:'记住这趟车',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'已记住这趟车',exact:true}).count(),1);
  await page.reload();assert.equal(await page.locator('.senior-time').textContent(),'18:00');
  await page.getByRole('button',{name:'返回首页',exact:true}).click();
  for(const [name,screen] of [['乘车码','scan'],['找人帮忙','help']]) { await page.getByRole('button',{name,exact:true}).click();assert.ok(page.url().endsWith(screen));await page.getByRole('button',{name:'返回首页',exact:true}).click(); }
  checks.push('Station selection, saved return, QR and help are reachable from home; every child returns in one tap');
  for(const viewport of [{width:320,height:568},{width:360,height:740},{width:390,height:844},{width:430,height:932}]) {
    await page.setViewportSize(viewport);
    for(const size of ['小字号','中字号','大字号']) {
      await settings();await page.getByRole('dialog').getByRole('button',{name:size,exact:true}).click();await close();
      for(const screen of ['ride','return','scan','help']) {await load(screen);await layout(`${viewport.width}x${viewport.height} ${size} ${screen}`,true); if(size==='大字号')await page.screenshot({path:`docs/mobile-screenshots/senior-${viewport.width}-${screen}.png`});}
    }
  }
  await settings(); await page.getByRole('switch',{name:'老年人模式'}).click();
  assert.equal(await page.locator('.groove-nav').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.dataset.textSize),'M');
  checks.push('Leaving senior mode restores the original normal text size and right navigation');
  for(const viewport of [{width:320,height:568},{width:360,height:740},{width:390,height:844},{width:430,height:932}]) {
    await page.setViewportSize(viewport);
    for(const name of ['小字号','中字号','大字号']) {
      await page.getByRole('button',{name,exact:true}).click();
      for(const screen of ['ride','return','scan','route','ticket','town','help','delay']){await load(screen);await layout(`${viewport.width}x${viewport.height} ${name} ${screen}`);}
    }
  }
  await page.setViewportSize({width:390,height:844});await load('route');await page.getByRole('button',{name:'中字号',exact:true}).click();await page.screenshot({path:'docs/mobile-screenshots/updated-route.png'});await settings();await page.screenshot({path:'docs/mobile-screenshots/updated-settings.png'});
  assert.deepEqual(issues,[]);
  checks.push('48 senior layouts fit one screen, all senior touch targets >= 44px; 96 normal footer layouts have no overlap');
} finally {await writeFile('docs/accessibility-results.json',JSON.stringify({checks,issues},null,2));await browser.close();console.log(JSON.stringify({checks,issues},null,2));}
