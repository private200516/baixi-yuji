import { chromium, launchOptions, baseURL } from './browser-runtime.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch(launchOptions);
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference',locale:'zh-CN'});
const page=await context.newPage();
const results=[], errors=[];
page.on('pageerror',error=>errors.push(error.message));
const nav=()=>page.getByRole('navigation',{name:'主要导航'});
const settle=()=>page.waitForFunction(()=>{
  const rail=document.querySelector('.groove-rail');
  const selected=rail?.querySelector('[aria-current=page]');
  const circle=rail?.querySelector('.groove-disc');
  if(!selected || !circle)return false;
  const buttonBounds=selected.getBoundingClientRect(),discBounds=circle.getBoundingClientRect();
  return Math.abs((discBounds.top+discBounds.height/2)-(buttonBounds.top+buttonBounds.height/2))<.75;
});
const positions=()=>page.locator('.groove-item').evaluateAll(items=>items.map(el=>({x:el.offsetLeft,y:el.offsetTop,width:el.offsetWidth,height:el.offsetHeight})));
async function check(name,work){await work();results.push({name,result:'PASS'});console.log(`PASS ${name}`);}
try{
  await mkdir('docs/mobile-screenshots',{recursive:true});
  await page.goto(`${baseURL}/#/route`);
  await page.evaluate(()=>document.fonts.ready);await settle();
  await check('凹槽与圆形底座使用同一逐帧位置，图标点击区域固定',async()=>{
    const before=await positions();
    const initialPath=await page.locator('.groove-outline').getAttribute('d');
    await nav().getByRole('button',{name:'帮助',exact:true}).click();
    const samples=await page.evaluate(()=>new Promise(resolve=>{
      const samples=[],start=performance.now();
      function record(now){
        const circle=document.querySelector('.groove-disc'),path=document.querySelector('.groove-outline');
        samples.push({y:Number(circle.getAttribute('cy')),groove:Number(path.dataset.center),path:path.getAttribute('d')});
        if(now-start<550)requestAnimationFrame(record);else resolve(samples);
      }requestAnimationFrame(record);
    }));
    assert.ok(new Set(samples.map(s=>s.y.toFixed(2))).size>4,'must animate through intermediate positions');
    for(const sample of samples) assert.equal(sample.y,sample.groove,'disc and groove must stay in exact sync');
    assert.notEqual(samples.at(-1).path,initialPath,'the rail outline itself must change');
    assert.deepEqual(await positions(),before,'buttons must never translate with the follower');
    await settle();
  });
  await check('快速连续切换从当前位置转向且正确落位',async()=>{
    await nav().getByRole('button',{name:'候车',exact:true}).click();
    await page.waitForFunction(()=>Number(document.querySelector('.groove-disc').getAttribute('cy'))<260);
    await nav().getByRole('button',{name:'返程',exact:true}).click();await settle();
    assert.equal(await nav().getByRole('button',{name:'返程',exact:true}).getAttribute('aria-current'),'page');
    await nav().getByRole('button',{name:'乘车码',exact:true}).click();await settle();
    await page.screenshot({path:'docs/mobile-screenshots/groove-scan-390.png'});
  });
  await check('首尾选项都落在完整槽内，保留同底色留白',async()=>{
    for(const label of ['候车','帮助']){
      await nav().getByRole('button',{name:label,exact:true}).click();await settle();
      const geometry=await page.evaluate(()=>{
        const svg=document.querySelector('.groove-shape'),c=document.querySelector('.groove-disc'),p=document.querySelector('.groove-outline');
        const disc=c.getBoundingClientRect(),icon=document.querySelector('.groove-item.active .glyph').getBoundingClientRect();
        return {width:svg.viewBox.baseVal.width,height:svg.viewBox.baseVal.height,cy:+c.getAttribute('cy'),cx:+c.getAttribute('cx'),r:+c.getAttribute('r'),fill:getComputedStyle(c).fill,bodyFill:getComputedStyle(p).fill,iconAlignment:Math.abs(icon.left+icon.width/2-disc.left-disc.width/2)};
      });
      assert.ok(geometry.cy-geometry.r>0 && geometry.cy+geometry.r<geometry.height);
      assert.ok(geometry.width*.66-(geometry.cx+geometry.r)>3,'visible cutout clearance');
      assert.equal(geometry.fill,geometry.bodyFill);
      assert.ok(geometry.iconAlignment<1.5,'selected icon must be horizontally centered inside its circle');
    }
  });
  await check('系统减少动效立即落位',async()=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await nav().getByRole('button',{name:'返程',exact:true}).click();await settle();
    assert.equal(await page.locator('.groove-symbol').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  });
  await check('窄屏和实际内嵌预览尺寸：列表、首末班、字号按钮无交叉',async()=>{
    const issues=[];
    for(const viewport of [{width:320,height:568},{width:390,height:667},{width:390,height:844},{width:430,height:932},{width:600,height:760},{width:950,height:956},{width:1024,height:900},{width:1440,height:1050}]){
      await page.setViewportSize(viewport);
      for(const size of ['S','M','L']){
        await page.addInitScript(size=>localStorage.setItem('baixi.mobile.v2',JSON.stringify({size,quiet:true})),size);
        for(const screen of ['ride','route','return','scan','ticket','town','help','delay']){
          await page.goto(`${baseURL}/#/${screen}`);await page.evaluate(()=>document.fonts.ready);await settle();
          const failures=await page.evaluate(()=>{
            const failures=[];
            for(const selector of ['.teal-content','.stop-list','.faq-list','.paper-ticket']){
              const parent=document.querySelector(selector);if(!parent)continue;
              const bounds=parent.getBoundingClientRect();
              for(const child of parent.children){
                if(getComputedStyle(child).display==='none')continue;
                const rect=child.getBoundingClientRect();
                if(rect.bottom>bounds.bottom+2 || rect.right>bounds.right+3)failures.push(`${selector} ${child.className||child.tagName}`);
              }
            }
            const list=document.querySelector('.detail-stops'),service=document.querySelector('.route-service');
            if(list && service && list.lastElementChild.getBoundingClientRect().bottom>service.getBoundingClientRect().top-2)failures.push('last station overlaps service times');
            const size=document.querySelector('.size-controls').getBoundingClientRect(),rail=document.querySelector('.groove-rail').getBoundingClientRect();
            if(size.bottom+5>rail.top)failures.push('font controls overlap navigation');
            const marker=document.querySelector('.vertical-signature').getBoundingClientRect(),cta=document.querySelector('.notch-action').getBoundingClientRect();
            if(marker.right+3>cta.left)failures.push('signature overlaps CTA');
            if(innerWidth<=520 && (document.documentElement.scrollHeight>innerHeight || document.documentElement.scrollWidth>innerWidth))failures.push('page scroll');
            return failures;
          });
          if(failures.length)issues.push(`${viewport.width}x${viewport.height} ${size} ${screen}: ${failures.join(', ')}`);
          if(size==='M' && screen==='route' && [390,950].includes(viewport.width))await page.screenshot({path:`docs/mobile-screenshots/groove-route-${viewport.width}x${viewport.height}.png`});
        }
      }
    }
    assert.deepEqual(issues,[]);
  });
  assert.deepEqual(errors,[]);
  await writeFile('docs/groove-navigation-results.json',JSON.stringify({results,errors},null,2));
}catch(error){await writeFile('docs/groove-navigation-results.json',JSON.stringify({results,errors,failure:String(error)},null,2));throw error;}
finally{await browser.close();}
