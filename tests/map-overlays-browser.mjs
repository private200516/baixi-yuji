import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:5173',out='.delivery/map-loop-component',results=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
const check=async(name,run)=>{try{await run();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',detail:error.message});}};
const state=()=>page.locator('.map-canvas').evaluate(element=>({...element.dataset}));
const ready=()=>page.waitForFunction(()=>document.querySelector('.map-canvas')?.dataset.mapZoom);
await page.goto(base+'/tests/map-loop-harness.html');await ready();await page.evaluate(()=>document.fonts.ready);
await check('complete local loop uses ordered numbered village nodes and no POIs at overview',async()=>{
  await page.waitForFunction(()=>document.querySelector('.loop-village .pin-dot')?.textContent);
  assert.equal(await page.locator('.loop-village').count(),5);assert.equal(await page.locator('.poi-marker').count(),0);
  assert.equal(await page.locator('[data-village-id=qingtan] .pin-dot').innerText(),'1');
  assert.equal(await page.locator('.map-message').count(),0);
  await page.screenshot({path:out+'/loop-harness.png',fullPage:true});
});
await check('48px POI targets cluster at a member location and open complete IDs once',async()=>{
  await page.locator('[data-scope=village]').click();await page.locator('.poi-cluster').waitFor();
  const targets=await page.locator('.poi-marker').evaluateAll(elements=>elements.map(element=>({ids:element.dataset.poiIds,rect:element.getBoundingClientRect().toJSON()})));
  assert.equal(targets.length,2);assert.ok(targets.every(target=>target.rect.width>=48&&target.rect.height>=48));
  assert.ok(Math.abs(targets[0].rect.x-targets[1].rect.x)>=48||Math.abs(targets[0].rect.y-targets[1].rect.y)>=48);
  assert.equal(await page.locator('[data-poi-id=pending]').count(),0);
  await page.locator('.poi-cluster').click();assert.equal(await page.locator('[data-selected-pois]').getAttribute('data-selected-pois'),'fixture-a,fixture-b');assert.equal(await page.locator('.poi-cluster').getAttribute('aria-pressed'),'true');
  await page.locator('[data-poi-id=fixture-c]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-selected-pois]').getAttribute('data-selected-pois'),'fixture-c');assert.equal(await page.locator('[data-poi-id=fixture-c]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.poi-cluster').getAttribute('aria-pressed'),'false');
  await page.screenshot({path:out+'/local-poi-test-fixtures.png',fullPage:true});
});
await check('manual camera including padded view survives remount, font readiness and inset changes',async()=>{
  const box=await page.locator('.map-canvas').boundingBox();await page.mouse.move(box.x+180,box.y+300);await page.mouse.down();await page.mouse.move(box.x+215,box.y+350,{steps:8});await page.mouse.up();await page.waitForTimeout(450);
  const before=await state(),pinBefore=await page.locator('[data-village-id=xujiashan]').boundingBox();
  await page.locator('[data-mount]').click();await page.locator('[data-mount]').click();await ready();await page.waitForTimeout(300);
  const after=await state(),pinAfter=await page.locator('[data-village-id=xujiashan]').boundingBox();
  assert.equal(after.mapZoom,before.mapZoom);after.mapCenter.split(',').forEach((value,index)=>assert.ok(Math.abs(Number(value)-Number(before.mapCenter.split(',')[index]))<1e-8));
  assert.ok(Math.abs(pinBefore.x-pinAfter.x)<1&&Math.abs(pinBefore.y-pinAfter.y)<1,'padding must not shift the restored point');
  await page.locator('[data-large]').click();await page.waitForTimeout(120);const resized=await state();assert.equal(resized.mapCenter,after.mapCenter);assert.equal(resized.mapZoom,after.mapZoom);
  await page.locator('[data-scope=loop]').click();assert.equal(await page.locator('.poi-marker').count(),0);assert.notEqual((await state()).mapZoom,before.mapZoom);
});
await check('opted-in village groups retain every village with disjoint 48px touch targets',async()=>{
  await page.setViewportSize({width:320,height:900});await page.locator('[data-village-grouping]').click();await page.locator('[data-scope=loop]').click();
  const targets=await page.locator('.village-pin[aria-hidden=false]').evaluateAll(elements=>elements.map(element=>({ids:element.dataset.villageGroupIds.split(','),box:element.getBoundingClientRect().toJSON()})));
  assert.equal(new Set(targets.flatMap(target=>target.ids)).size,5);
  for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){const a=targets[i].box,b=targets[j].box;assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);}
  const group=page.locator('.village-cluster[aria-hidden=false]').first(),ids=await group.getAttribute('data-village-group-ids');await group.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-selected-villages]').getAttribute('data-selected-villages'),ids);
  assert.equal(await page.locator('.village-pin[data-village-group-hidden=true][tabindex="0"]').count(),0);
});
await check('component completes without JavaScript errors',async()=>assert.deepEqual(errors,[]));
await writeFile(out+'/results.json',JSON.stringify({scope:'Isolated component; synthetic POI fixtures are test data, not real sightseeing evidence.',results,errors},null,2));
await browser.close();console.log(JSON.stringify(results,null,2));if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
