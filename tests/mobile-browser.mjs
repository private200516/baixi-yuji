import { chromium, launchOptions, baseURL } from './browser-runtime.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',reducedMotion:'reduce'});
const page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if(r.status()>=400) errors.push(`${r.status()} ${r.url()}`); });
async function check(name, run) { await run(); checks.push({name,result:'PASS'}); console.log(`PASS ${name}`); }
const rail = () => page.getByRole('navigation',{name:'主要导航'});
async function nav(name) { await rail().getByRole('button',{name,exact:true}).click(); }
async function closeToast() { if(await page.getByRole('button',{name:'关闭提示',exact:true}).count()) await page.getByRole('button',{name:'关闭提示',exact:true}).click(); }
async function load(screen='ride') { await page.goto(`${baseURL}/#/${screen}`); await page.evaluate(() => document.fonts.ready); }
try {
  await load();
  await check('右侧导航存在，底部导航已移除',async()=>{assert.equal(await page.locator('.bottom-nav').count(),0);assert.equal(await rail().getByRole('button').count(),5);});
  await check('候车方向和线路详情一致',async()=>{await page.getByRole('button',{name:'切换行车方向',exact:true}).click();assert.equal(await page.locator('.destination').textContent(),'开往溪畔站');await page.getByRole('button',{name:'展开完整线路'}).click();assert.match(await page.locator('.route-title').textContent(),/城南客运站.*溪畔站/);await page.locator('.detail-stops button').last().click();assert.equal(await page.locator('.destination').textContent(),'开往城南客运站');});
  await check('站点搜索、无结果和选择',async()=>{await page.getByRole('button',{name:'查找附近站点',exact:true}).click();await page.getByRole('textbox',{name:'搜索站点'}).fill('不存在');await page.getByRole('heading',{name:'没有找到这个站'}).waitFor();await page.getByRole('button',{name:'查看全部站点'}).click();await page.getByRole('textbox',{name:'搜索站点'}).fill('东湖');await page.locator('.nearby-list>button').click();assert.match(await page.locator('.station-heading').textContent(),/东湖站/);assert.equal(await page.locator('.hero-number').textContent(),'8');await closeToast();});
  await check('弹层 Esc 关闭并返回触发按钮',async()=>{const trigger=page.getByRole('button',{name:'查找附近站点',exact:true});await trigger.click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);});
  await check('收藏在刷新后保留',async()=>{await page.getByRole('button',{name:'收藏线路',exact:true}).click();await page.reload();assert.equal(await page.getByRole('button',{name:'取消收藏线路',exact:true}).getAttribute('aria-pressed'),'true');});
  await check('返程班次、保存、恢复和移除',async()=>{await nav('返程');await page.getByRole('button',{name:'18:00',exact:true}).click();await page.getByRole('button',{name:'保存这趟返程',exact:true}).click();await page.reload();assert.equal(await page.locator('.hero-number').textContent(),'18:00');await page.getByRole('button',{name:'查看返程卡',exact:true}).click();await page.getByRole('button',{name:'移除返程卡',exact:true}).click();assert.equal(await page.getByRole('button',{name:'保存这趟返程',exact:true}).count(),1);await closeToast();});
  await check('扫码、车票刷新与空订单',async()=>{await nav('乘车码');await page.getByRole('button',{name:'查看我的车票',exact:true}).click();await page.getByRole('button',{name:'刷新演示票面'}).click();assert.match(await page.locator('.paper-ticket>p').textContent(),/0002/);await closeToast();await page.getByRole('button',{name:'我的车票记录'}).click();await page.getByRole('heading',{name:'第一程，还未启程'}).waitFor();await page.getByRole('button',{name:'查看演示车票',exact:true}).click();});
  await check('导览地图点位和公交入口',async()=>{await nav('古镇');await page.getByRole('button',{name:'查看石巷'}).click();assert.match(await page.locator('.landmark-description h3').textContent(),/石巷/);await page.getByRole('button',{name:'查看公交线路'}).click();await page.locator('.screen-route').waitFor();});
  await check('帮助通过弹层展开，主画面不增高',async()=>{await nav('帮助');const height=await page.locator('.phone').evaluate(el=>el.clientHeight);await page.getByRole('button',{name:'如何使用乘车码？',exact:true}).click();assert.match(await page.locator('.faq-answer').textContent(),/右侧/);await page.getByRole('button',{name:'知道了'}).click();assert.equal(await page.locator('.phone').evaluate(el=>el.clientHeight),height);await page.getByRole('checkbox',{name:/减少动态效果/}).check();await page.reload();assert.equal(await page.getByRole('checkbox',{name:/减少动态效果/}).isChecked(),true);});
  await check('异常状态重新查询恢复到候车',async()=>{await page.getByRole('button',{name:'查看异常状态示例'}).click();await page.getByRole('button',{name:'重新查询',exact:true}).click();await page.locator('.screen-ride').waitFor();await closeToast();});
  await check('八个页面 × 三档字号 × 四种手机尺寸均不滚动且内容不互相遮挡',async()=>{
    const matrixIssues=[];
    for(const viewport of [{width:320,height:568},{width:360,height:740},{width:390,height:844},{width:430,height:932}]) {
      await page.setViewportSize(viewport);
      for(const mode of ['小字号','中字号','大字号']) {
        await page.getByRole('button',{name:mode,exact:true}).click();
        for(const screen of ['ride','return','scan','route','ticket','town','help','delay']) {
          await load(screen);
          const issues=await page.evaluate(()=>{
            const result=[];
            if(document.documentElement.scrollHeight>innerHeight)result.push('page vertical scroll');
            if(document.documentElement.scrollWidth>innerWidth)result.push('horizontal scroll');
            for(const selector of ['.teal-content','.faq-list','.stop-list','.paper-ticket','.landmark-description']){
              const parent=document.querySelector(selector);if(!parent)continue;
              const pr=parent.getBoundingClientRect();
              for(const el of parent.children){
                if(getComputedStyle(el).display==='none')continue;
                const r=el.getBoundingClientRect();
                if(r.height>0&&(r.bottom>pr.bottom+2||r.right>pr.right+8))result.push(`${selector} > ${el.className||el.tagName} out of parent`);
              }
            }
            const button=document.querySelector('.notch-action button').getBoundingClientRect();
            if(button.bottom>innerHeight)result.push('action outside screen');
            return result;
          });
          if(issues.length) matrixIssues.push(`${viewport.width}x${viewport.height} ${mode} ${screen}: ${issues}`);
        }
      }
    }
    assert.deepEqual(matrixIssues,[]);
  });
  await page.setViewportSize({width:390,height:844});await load();await page.getByRole('button',{name:'大字号',exact:true}).click();await page.screenshot({path:'docs/mobile-screenshots/390x844-large.png'});
  await check('本机字号偏好保存',async()=>{await page.reload();assert.equal(await page.getByRole('button',{name:'大字号'}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'中字号'}).click();});
  await check('减少动态效果和动画设置',async()=>{await nav('帮助');await page.getByRole('checkbox',{name:/减少动态效果/}).uncheck();await nav('候车');assert.equal(await page.evaluate(()=>document.getAnimations().length),0);await page.emulateMedia({reducedMotion:'no-preference'});await load();assert.ok(await page.evaluate(()=>document.getAnimations().length)>0);});
  await check('存储不可写时明确提示',async()=>{const broken=await browser.newContext({viewport:{width:390,height:844}});await broken.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new Error('denied')};});const p=await broken.newPage();await p.goto(baseURL);await p.getByRole('button',{name:'收藏线路',exact:true}).click();await p.getByRole('status').filter({hasText:'本机暂时无法保存'}).waitFor();await broken.close();});
  assert.deepEqual(errors,[]);
  await writeFile('docs/mobile-browser-results.json',JSON.stringify({checks,errors},null,2));
}catch(error){await page.screenshot({path:'docs/mobile-screenshots/test-failure.png'});await writeFile('docs/mobile-browser-results.json',JSON.stringify({checks,errors,failure:String(error)},null,2));throw error;}
finally{await browser.close();}
