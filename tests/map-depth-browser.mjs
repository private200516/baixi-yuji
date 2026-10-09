import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:5173', results=[];
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
await mkdir('docs/map-depth-screenshots',{recursive:true});
const check=async(name,run)=>{try{await run();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',detail:error.message});}};
const pages=[];
async function page(width=390){const p=await browser.newPage({viewport:{width,height:844}});pages.push(p);return p;}
async function ready(p){await p.goto(base+'/tests/map-depth-harness.html');await p.locator('.village-pin').first().waitFor();await p.waitForFunction(()=>document.querySelector('.map-canvas')?.dataset.mapZoom);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(450);assert.ok((await p.locator('.map-canvas').boundingBox()).height>200,'map canvas must visibly occupy the card');}
async function state(p){return p.locator('.map-canvas').evaluate(el=>({...el.dataset}));}
async function countyFits(p){
  const result=await p.evaluate(async()=>{
    const {mapVillages}=await import('/src/data/villages.ts');
    const {extent}=await (await fetch('/geography/manifest.json')).json();
    const card=document.querySelector('.map-card'),box=card.getBoundingClientRect(),footer=card.querySelector('.map-attribution').getBoundingClientRect();
    const point=id=>{const dot=card.querySelector(`.village-pin[data-village-id=${id}] .pin-dot`).getBoundingClientRect();return {x:(dot.left+dot.right)/2,y:(dot.top+dot.bottom)/2,geo:mapVillages.find(v=>v.id===id).normalizedCoordinate};};
    const west=point('longgong'),east=point('xujiashan'),north=point('qingtan'),south=point('ruoao');
    const mercator=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
    const x=lon=>west.x+(lon-west.geo[0])*(east.x-west.x)/(east.geo[0]-west.geo[0]);
    const y=lat=>north.y+(mercator(lat)-mercator(north.geo[1]))*(south.y-north.y)/(mercator(south.geo[1])-mercator(north.geo[1]));
    const projected={left:x(extent[0]),right:x(extent[2]),top:y(extent[3]),bottom:y(extent[1])};
    const pins=[...card.querySelectorAll('.pin-dot')].map(el=>el.getBoundingClientRect());
    return {projected,box:box.toJSON(),footerTop:footer.top,pinsInside:pins.every(r=>r.left>box.left+2&&r.right<box.right-2&&r.top>box.top+2&&r.bottom<footer.top-2),visiblePins:card.querySelectorAll('.village-pin[aria-hidden=false]').length};
  });
  assert.equal(result.visiblePins,5);assert.ok(result.pinsInside,'all five geographic dots must stay inside the map');
  assert.ok(result.projected.left>=result.box.left+2&&result.projected.right<=result.box.right-2&&result.projected.top>=result.box.top+2&&result.projected.bottom<=result.footerTop-2,'whole county bounds must fit above attribution');
  return result;
}
await check('same geographic center and zoom survive flat / relief comparison',async()=>{
  const p=await page(),requests=[],errors=[];p.on('request',r=>requests.push(r.url()));p.on('pageerror',e=>errors.push(e.message));await ready(p);
  assert.equal(await p.locator('.village-pin').count(),5);
  const before=await state(p);await p.locator('[data-depth=relief]').click();await p.waitForTimeout(450);const after=await state(p);
  assert.equal(after.mapPitch,'42');assert.equal(after.mapZoom,before.mapZoom);
  after.mapCenter.split(',').forEach((n,i)=>assert.ok(Math.abs(Number(n)-Number(before.mapCenter.split(',')[i]))<.0000001));
  assert.equal(await p.locator('.map-message').count(),0);assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(base)||url.startsWith('blob:')||url.startsWith('data:')));
  await p.screenshot({path:'docs/map-depth-screenshots/county-relief-harness.png',fullPage:true});
});
await check('local building sample appears only at local scale and unknown coverage stays explicit',async()=>{
  const p=await page(1440);await ready(p);await p.locator('[data-scope=village]').click();await p.waitForTimeout(450);
  assert.ok(Number((await state(p)).mapZoom)>=14);assert.equal(await p.locator('.map-card').getAttribute('data-buildings-available'),'1');
  assert.equal(await p.locator('.village-pin[aria-hidden=true][tabindex="-1"]').count(),4);
  assert.match(await p.locator('.map-status').innerText(),/建筑高度为示意/);
  await p.locator('[data-depth=relief]').click();await p.waitForTimeout(450);await p.screenshot({path:'docs/map-depth-screenshots/local-relief-harness.png',fullPage:true});
  await p.locator('[data-select=ruoao]').click();await p.waitForTimeout(450);assert.match(await p.locator('.map-status').innerText(),/暂无建筑轮廓/);
  assert.equal(await p.locator('.map-card').getAttribute('data-buildings-available'),'0');
});
await check('road route scope, candidate reference points and reduced motion',async()=>{
  const p=await page();await ready(p);await p.locator('[data-scope=route]').click();await p.waitForTimeout(450);
  assert.equal(await p.locator('.boarding-marker').count(),2);assert.match(await p.locator('.boarding-marker').first().getAttribute('aria-label'),/道路参考点，未核验/);
  await p.locator('[data-quiet]').click();await p.locator('[data-depth=relief]').click();await p.waitForTimeout(70);assert.equal((await state(p)).mapPitch,'42');
  await p.locator('[data-scope=county]').click();assert.equal(await p.locator('.boarding-marker').count(),0);
});
await check('missing optional detail keeps base map and announces absence',async()=>{
  const p=await page();await p.route('**/geography/buildings.geojson',r=>r.fulfill({status:503,body:'unavailable'}));await ready(p);
  assert.equal(await p.locator('.map-message').count(),0);assert.match(await p.locator('.map-status').innerText(),/局部数据未载入/);
});
await check('WebGL loss uses visible fallback without fake replacement geography',async()=>{
  const p=await page();await ready(p);await p.locator('canvas').evaluate(el=>el.dispatchEvent(new Event('webglcontextlost')));
  await p.locator('.map-message').waitFor();assert.match(await p.locator('.map-message').innerText(),/地图显示中断/);
  await p.locator('[data-select=longgong]').click();assert.equal(await p.locator('[data-selected]').getAttribute('data-selected'),'longgong');
});
await check('390px integrated compact and fullscreen maps refit scope without moving geography',async()=>{
  const p=await page();await p.goto(base+'/#/ride');await p.locator('.village-pin').first().waitFor();await p.waitForTimeout(700);
  const compact=await countyFits(p),before=await state(p);assert.ok(compact.projected.bottom-compact.projected.top>=120,'county preview must use available height');
  await p.screenshot({path:'docs/map-depth-screenshots/mobile-compact-county.png',fullPage:true});
  await p.getByRole('button',{name:'全屏地图',exact:true}).click();await p.waitForTimeout(450);await countyFits(p);assert.ok(Number((await state(p)).mapZoom)>Number(before.mapZoom));
  await p.screenshot({path:'docs/map-depth-screenshots/mobile-fullscreen-county.png',fullPage:true});
  await p.getByRole('button',{name:'村内',exact:true}).click();await p.waitForTimeout(450);const flat=await state(p);
  await p.getByRole('button',{name:'立体',exact:true}).click();await p.waitForTimeout(400);const relief=await state(p);assert.equal(relief.mapZoom,flat.mapZoom);relief.mapCenter.split(',').forEach((n,i)=>assert.ok(Math.abs(Number(n)-Number(flat.mapCenter.split(',')[i]))<.0000001));
  await p.screenshot({path:'docs/map-depth-screenshots/mobile-fullscreen-village.png',fullPage:true});
  await p.getByRole('button',{name:'平面',exact:true}).click();await p.getByRole('button',{name:'全县',exact:true}).click();await p.getByRole('button',{name:'退出全屏地图',exact:true}).click();await p.waitForTimeout(500);await countyFits(p);
});
await Promise.all(pages.map(p=>p.close()));await browser.close();await writeFile('docs/map-depth-browser-results.json',JSON.stringify({date:'2026-10-09',scope:'Five isolated GeographyMap checks plus the real 390px MobileApp compact/fullscreen regression. Files ending harness.png are isolated component screenshots; mobile-*.png are real app screenshots.',results},null,2));console.log(JSON.stringify(results,null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
