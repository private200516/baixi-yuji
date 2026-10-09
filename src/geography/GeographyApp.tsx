import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { mapVillages, villages } from '../data/villages';
import { GrooveNavigation } from '../mobile/GrooveNavigation';
import { Glyph } from '../mobile/TransitArt';
import { product } from './config';

const GeographyMap=lazy(()=>import('./GeographyMap').then(module=>({default:module.GeographyMap})));

type View = 'ride'|'return'|'town'|'help';
const items: {id:View;label:string;icon:'bus'|'back'|'town'|'help'}[]=[{id:'ride',label:'乘车',icon:'bus'},{id:'return',label:'返程',icon:'back'},{id:'town',label:'古村',icon:'town'},{id:'help',label:'帮助',icon:'help'}];
type Preferences = {size:'small'|'medium'|'large';quiet:boolean;senior:boolean;storageError:boolean};
function loadPreferences(): Preferences {
  try {
    const current=JSON.parse(localStorage.getItem('ninghai-geography-preferences')||'null');
    const old=JSON.parse(localStorage.getItem('baixi.mobile.v2')||'{}');
    const data=current??old;
    return {size:data.size==='large'||data.size==='L'?'large':data.size==='small'||data.size==='S'?'small':'medium',quiet:data.quiet===true,senior:data.senior===true,storageError:false};
  } catch {return {size:'medium',quiet:false,senior:false,storageError:true};}
}
function route(): View {const value=location.hash.replace('#/','');return items.some(i=>i.id===value)?value as View:'ride';}
export default function GeographyApp() {
  const [view,setView]=useState<View>(route),[selectedId,setSelectedId]=useState(mapVillages[0].id),[preferences,setPreferences]=useState(loadPreferences),[drawer,setDrawer]=useState(false),[systemQuiet,setSystemQuiet]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const menuButton=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
  const selected=mapVillages.find(v=>v.id===selectedId)!;
  const reducedMotion=preferences.quiet||systemQuiet||preferences.senior;
  const large=preferences.size==='large'||preferences.senior;
  useEffect(()=>{
    const update=()=>setView(route());window.addEventListener('hashchange',update);
    const media=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setSystemQuiet(media.matches);media.addEventListener('change',change);
    return()=>{window.removeEventListener('hashchange',update);media.removeEventListener('change',change);};
  },[]);
  useEffect(()=>{document.title=product.name;document.documentElement.dataset.motion=reducedMotion?'reduced':'full';},[reducedMotion]);
  useEffect(()=>{
    if(!drawer)return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setDrawer(false);menuButton.current?.focus();}
      if(event.key==='Tab'){
        const buttons=[...menu.current!.querySelectorAll<HTMLButtonElement>('button')];const first=buttons[0],last=buttons.at(-1)!;
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);
  },[drawer]);
  function navigate(next:View){location.hash='/'+next;setView(next);setDrawer(false);if(drawer)menuButton.current?.focus();}
  function save(changes:Partial<Preferences>){setPreferences(previous=>{const next={...previous,...changes};try{localStorage.setItem('ninghai-geography-preferences',JSON.stringify(next));next.storageError=false;}catch{next.storageError=true;}return next;});}
  const list=<section className="village-list" aria-labelledby="list-title"><div className="section-heading"><h2 id="list-title">选择古村</h2><span>{mapVillages.length} 处已核验位置</span></div><div className="village-options">{mapVillages.map((v,i)=><button key={v.id} aria-pressed={selectedId===v.id} data-village-id={v.id} onClick={()=>setSelectedId(v.id)}><span className="village-number">0{i+1}</span><span><strong>{v.displayName}</strong><span className="township">{v.township} · 历史聚落</span></span><Glyph name={selectedId===v.id?'check':'chevron'}/></button>)}</div></section>;
  const summary=<section className="village-summary" data-selected-village-id={selectedId} aria-labelledby="selected-title"><div className="section-heading"><span className="eyebrow">所选古村</span><Glyph name="town"/></div><h2 id="selected-title">{selected.displayName}</h2><p className="village-location">宁海县 · {selected.township}</p><p className="village-intro">{selected.description}</p><div className="status-strip"><Glyph name="pin"/><span>村落位置已核验<br/><strong>上车地点尚未确认</strong></span></div><button className="primary" onClick={()=>navigate('town')}>查看古村资料<Glyph name="arrow"/></button></section>;
  return <div className={`geography-app size-${preferences.size} ${large?'large-type':''} ${preferences.senior?'senior-mode':''}`}>
    <a className="skip-link" href="#main-content" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus();}}>跳到主要内容</a>
    <header className="app-header"><a className="brand" href="#/ride"><span className="brand-symbol" aria-hidden="true"><Glyph name="town"/></span><span><span className="brand-region">{product.region}</span><strong>{product.name}</strong></span></a><div className="header-actions"><div className="font-controls" aria-label="字体大小">{([{id:'small',label:'小'},{id:'medium',label:'中'},{id:'large',label:'大'}] as const).map(item=><button key={item.id} aria-pressed={preferences.size===item.id} onClick={()=>save({size:item.id})}>{item.label}</button>)}</div><button className="menu-toggle" ref={menuButton} aria-label="打开右侧导航" aria-expanded={drawer} onClick={()=>setDrawer(true)}><Glyph name="help"/><span>菜单</span></button></div></header>
    <div className="app-layout"><main id="main-content" tabIndex={-1}>
      {preferences.storageError&&<p className="inline-notice" role="status">设置仅在本次使用中生效，浏览器暂时无法保存。</p>}
      {(view==='ride'||view==='town')&&<>
        <div className="page-heading"><div><p className="eyebrow">{view==='ride'?'认识目的地，再出发':'山水之间 · 古村有迹'}</p><h1>{view==='ride'?'一程山水，一处古村':'宁海古村地图'}</h1></div><span className="stage-tag">研究预览</span></div>
        <p className="page-lead">{preferences.senior?'先点一个村名，查看位置与说明。':'从真实地理开始，慢慢认识宁海的古村。'}</p>
        <div className="map-and-summary">{!preferences.senior&&<Suspense fallback={<section className="map-card map-loading" role="status">正在载入地图组件…</section>}><GeographyMap selectedId={selectedId} onSelect={setSelectedId} reducedMotion={reducedMotion} large={large}/></Suspense>}{summary}</div>
        <p className="service-note"><Glyph name="bus"/><span>本站展示古村位置。旅游专线、停靠站和班次尚未确认，请勿据此候车。</span></p>
        {list}
        {view==='town'&&<section className="information" data-selected-village-id={selectedId}><h2>{selected.displayName} · 核验资料</h2><p>{selected.heritageEvidence}</p><p>{selected.coordinatePrecisionNote}</p><p>{selected.notes}</p><details><summary>查看来源与坐标</summary><p>WGS84：{selected.normalizedCoordinate?.join('，')}。核验日期：{selected.checkedAt}。</p>{[...selected.identitySources,...selected.geographySources].map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>{s.publishedAt&&` · ${s.publishedAt}`}</p>)}</details></section>}
        {!preferences.senior&&<details className="pending-list"><summary>其他候选村落 · 尚未落点</summary><p>坐标未知的村落不放入地图；行政合并关系和现行村名将继续核实。</p>{villages.filter(v=>!v.normalizedCoordinate).map(v=><div key={v.id}><strong>{v.displayName}</strong><p>{v.notes}</p></div>)}</details>}
      </>}
      {view==='return'&&<><div className="page-heading"><div><p className="eyebrow">返程安排</p><h1>返程信息尚待确认</h1></div></div><section className="information service-empty"><Glyph name="back"/><h2>先记住您所在的古村</h2><p className="selected-return">{selected.displayName} · {selected.township}</p><p>目前没有经过运营方确认的返程站点、班次或末班车时间。</p><p>出发前请向当地公交运营方或村内工作人员核实往返方式。</p><button className="primary" onClick={()=>navigate('town')}>查看所选古村<Glyph name="arrow"/></button></section></>}
      {view==='help'&&<><div className="page-heading"><div><p className="eyebrow">使用帮助与设置</p><h1>看得清，用得简单</h1></div></div><section className="information settings"><h2>阅读设置</h2><label><span><strong>老年人模式</strong><span>大字显示，直接选择村名。</span></span><input type="checkbox" checked={preferences.senior} onChange={e=>save({senior:e.target.checked})}/></label><label><span><strong>减少动态效果</strong><span>关闭地图与导航的移动过渡。</span></span><input type="checkbox" checked={preferences.quiet} onChange={e=>save({quiet:e.target.checked})}/></label><button className="primary" onClick={()=>navigate('ride')}>返回选择古村<Glyph name="arrow"/></button></section><section className="information"><h2>怎样使用</h2><ol><li>在列表中选择一个古村。</li><li>查看古村的位置、说明与资料。</li><li>公交站点与班次确认后再安排乘车。</li></ol><details><summary>地图与数据说明</summary><p>地图采用本地 OpenStreetMap 县界、主要道路和水系样本，不代表完整道路覆盖或公交线路。核验日期：{product.checkedAt}。</p><p>灰青线为县界，灰色线为主要道路，蓝色为水系；村名按钮表示聚落代表点。</p><p>未读取您的位置，不上传个人信息，不提供真实车辆定位。</p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap 数据许可与贡献者</a></details></section></>}
      <footer className="page-footer"><span>{product.stage}</span><span>资料核验 {product.checkedAt}</span></footer>
    </main><aside className="desktop-navigation"><GrooveNavigation items={items} active={view} onSelect={navigate} reducedMotion={reducedMotion} caption="慢行宁海" wordmark="宁海"/></aside></div>
    {drawer&&<div className="drawer-shade" onClick={()=>{setDrawer(false);menuButton.current?.focus();}}><div className="navigation-drawer" role="dialog" aria-modal="true" aria-label="右侧导航菜单" ref={menu} onClick={e=>e.stopPropagation()}><button className="drawer-close" onClick={()=>{setDrawer(false);menuButton.current?.focus();}}>关闭<Glyph name="close"/></button>{items.map(item=><button key={item.id} aria-current={item.id===view?'page':undefined} onClick={()=>navigate(item.id)}><Glyph name={item.icon}/>{item.label}</button>)}</div></div>}
  </div>;
}
