import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { mapVillages, villages } from '../data/villages';
import { GrooveNavigation } from '../mobile/GrooveNavigation';
import { Glyph } from '../mobile/TransitArt';
import { product } from './config';
import type { RouteResearch } from './routeTypes';
import type { MapBoardingPoint, MapDepth, MapRoute, MapScope } from './map-depth';

const GeographyMap = lazy(() => import('./GeographyMap').then(module => ({ default: module.GeographyMap })));
type View = 'ride' | 'return' | 'town' | 'help';
type Sheet = 'villages' | 'details' | 'journey' | 'settings' | null;
type Preferences = { size: 'small' | 'medium' | 'large'; quiet: boolean; senior: boolean; storageError: boolean };
type SavedPlan = { from: string; to: string; direction: 'outbound' | 'return'; dataVersion: string; savedAt: string; operatingStatus: 'research-not-confirmed' };
const items: { id: View; label: string; icon: 'bus' | 'back' | 'town' | 'help' }[] = [{ id: 'ride', label: '乘车', icon: 'bus' }, { id: 'return', label: '返程', icon: 'back' }, { id: 'town', label: '古村', icon: 'town' }, { id: 'help', label: '帮助', icon: 'help' }];
const nameOf = (id: string) => mapVillages.find(v => v.id === id)?.displayName ?? '请选择古村';
function route(): View { const value = location.hash.replace('#/', ''); return items.some(i => i.id === value) ? value as View : 'ride'; }
function loadPreferences(): Preferences {
  try {
    const data = JSON.parse(localStorage.getItem('ninghai-geography-preferences') || localStorage.getItem('baixi.mobile.v2') || '{}');
    return { size: ['large', 'L'].includes(data?.size) ? 'large' : ['small', 'S'].includes(data?.size) ? 'small' : 'medium', quiet: data?.quiet === true, senior: data?.senior === true, storageError: false };
  } catch { return { size: 'medium', quiet: false, senior: false, storageError: true }; }
}
function loadPlan(): SavedPlan | null {
  try {
    const value = JSON.parse(localStorage.getItem('xiangxu.local-plan') || 'null');
    return value && mapVillages.some(v => v.id === value.from) && mapVillages.some(v => v.id === value.to) && value.from !== value.to && ['outbound', 'return'].includes(value.direction) && typeof value.dataVersion === 'string' && typeof value.savedAt === 'string' && value.operatingStatus === 'research-not-confirmed' ? value : null;
  } catch { return null; }
}
function SheetPanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!, previous = document.activeElement as HTMLElement; dialog.showModal(); return () => { dialog.close(); previous?.isConnected && previous.focus(); }; }, []);
  return <dialog ref={ref} className="mobile-sheet" aria-labelledby="sheet-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}>
    <div className="sheet-top"><h2 id="sheet-title">{title}</h2><button aria-label="关闭面板" onClick={onClose}><Glyph name="close"/></button></div>{children}
  </dialog>;
}

export default function MobileApp() {
  const [view, setView] = useState<View>(route), [selectedId, setSelectedId] = useState(mapVillages[0].id);
  const [preferences, setPreferences] = useState(loadPreferences), [sheet, setSheet] = useState<Sheet>(null), [drawer, setDrawer] = useState(false);
  const [scope, setScope] = useState<MapScope>('county'), [depth, setDepth] = useState<MapDepth>('flat'), [fullscreen, setFullscreen] = useState(false);
  const [from, setFrom] = useState(mapVillages[0].id), [to, setTo] = useState(''), [direction, setDirection] = useState<'outbound' | 'return'>(() => route() === 'return' ? 'return' : 'outbound');
  const [research, setResearch] = useState<RouteResearch | null>(null), [researchError, setResearchError] = useState(false), [attempt, setAttempt] = useState(0);
  const [savedPlan, setSavedPlan] = useState(loadPlan), [notice, setNotice] = useState('');
  const [systemQuiet, setSystemQuiet] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const menuButton = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDialogElement>(null);
  const selected = mapVillages.find(v => v.id === selectedId)!;
  const large = preferences.size === 'large' || preferences.senior, reducedMotion = preferences.quiet || preferences.senior || systemQuiet;
  const routeFrom = direction === 'outbound' ? from : to, routeTo = direction === 'outbound' ? to : from;
  const currentRoute = research?.routes.find(r => r.fromVillageId === routeFrom && r.toVillageId === routeTo) ?? null;
  const mapRoute = useMemo<MapRoute | null>(() => currentRoute ? { id: currentRoute.id, geometryStatus: currentRoute.geometryStatus, geometry: currentRoute.coordinates ? { type: 'LineString', coordinates: currentRoute.coordinates } : null } : null, [currentRoute]);
  const referencePoints = useMemo<MapBoardingPoint[]>(() => research?.suggestions.filter(p => p.coordinates && (p.villageId === from || p.villageId === to)).map(p => ({ id: p.id, villageId: p.villageId, coordinates: p.coordinates!, name: `${nameOf(p.villageId)}附近道路参考点`, status: 'suggested' })) ?? [], [research, from, to]);
  useEffect(() => {
    const update = () => { const next = route(); setView(next); if (next === 'return') setDirection('return'); setSheet(null); setFullscreen(false); }; window.addEventListener('hashchange', update);
    const media = matchMedia('(prefers-reduced-motion: reduce)'), change = () => setSystemQuiet(media.matches); media.addEventListener('change', change);
    return () => { window.removeEventListener('hashchange', update); media.removeEventListener('change', change); };
  }, []);
  useEffect(() => { document.title = `${product.name} · ${product.serviceName}`; document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full'; }, [reducedMotion]);
  useEffect(() => {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(new DOMException('Road data timed out', 'TimeoutError')), 15000); setResearchError(false);
    fetch(import.meta.env.BASE_URL + 'geography/route-research.json', { signal: abort.signal }).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then((data: RouteResearch) => { if (!Array.isArray(data.routes) || !Array.isArray(data.suggestions) || !data.version || data.routes.some(r => r.operatingStatus !== 'research-not-confirmed' || r.estimatedDurationSeconds !== null)) throw new Error(); setResearch(data); }).catch(() => { if (!abort.signal.aborted) setResearchError(true); else if (abort.signal.reason?.name === 'TimeoutError') setResearchError(true); }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); abort.abort(); };
  }, [attempt]);
  useEffect(() => {
    if (!drawer) return; const dialog = menu.current!; dialog.showModal(); return () => { dialog.close(); menuButton.current?.focus(); };
  }, [drawer]);
  useEffect(() => { if (!fullscreen || sheet) return; const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [fullscreen, sheet]);
  function navigate(next: View) { location.hash = '/' + next; setView(next); setSheet(null); setDrawer(false); if (next === 'return') setDirection('return'); }
  function savePreferences(changes: Partial<Preferences>) { setPreferences(previous => { const next = { ...previous, ...changes }; try { localStorage.setItem('ninghai-geography-preferences', JSON.stringify(next)); next.storageError = false; } catch { next.storageError = true; } return next; }); }
  function chooseVillage(id: string) {
    setSelectedId(id);
    if (preferences.senior) { setTo(id); if (from === id) setFrom(''); }
    setSheet(null);
  }
  function chooseScope(next: MapScope) { if (next === 'route' && (!to || !currentRoute?.coordinates)) { setSheet('journey'); return; } setScope(next); }
  function savePlan() {
    if (!to || from === to || !research || !currentRoute?.coordinates) return;
    const value: SavedPlan = { from, to, direction, dataVersion: research.version, savedAt: new Date().toISOString(), operatingStatus: 'research-not-confirmed' };
    try { localStorage.setItem('xiangxu.local-plan', JSON.stringify(value)); setSavedPlan(value); setNotice('研究计划已保存在这台设备。'); } catch { setNotice('浏览器无法保存，当前选择仅在本次使用中保留。'); }
  }
  const villageList = <section className="village-list" aria-label="古村文字列表"><div className="section-heading"><h2>选择古村</h2><span>5 处历史聚落</span></div><div className="village-options">{mapVillages.map((v, i) => <button key={v.id} aria-pressed={selectedId === v.id} data-village-id={v.id} onClick={() => chooseVillage(v.id)}><span className="village-number">0{i + 1}</span><span><strong>{v.displayName}</strong><span className="township">{v.township}</span></span><Glyph name={selectedId === v.id ? 'check' : 'chevron'}/></button>)}</div></section>;
  const settings = <section className="settings"><label><span><strong>老年人模式</strong><span>大字、文字选村，步骤更简单。</span></span><input type="checkbox" checked={preferences.senior} onChange={e => savePreferences({ senior: e.target.checked })}/></label><label><span><strong>减少动态效果</strong><span>关闭镜头与导航移动过渡。</span></span><input type="checkbox" checked={preferences.quiet} onChange={e => savePreferences({ quiet: e.target.checked })}/></label><button className="primary" onClick={() => navigate('ride')}>返回选择古村<Glyph name="arrow"/></button></section>;
  const details = <section className="village-details" data-selected-village-id={selectedId}><span className="eyebrow">宁海县 · {selected.township}</span><h2>{selected.displayName}</h2><p>{selected.description}</p><p>{selected.heritageEvidence}</p><div className="endpoint-actions"><button onClick={() => { setFrom(selectedId); if (to === selectedId) setTo(''); setSheet('journey'); }}>设为起点</button><button className="primary" onClick={() => { setTo(selectedId); if (from === selectedId) setFrom(''); setSheet('journey'); }}>设为终点</button></div><p className="soft-note">这里是村落代表位置，上下客点尚未核验。</p><details><summary>核验资料与来源</summary><p>{selected.coordinatePrecisionNote}</p><p>{selected.notes}</p><p>WGS84：{selected.normalizedCoordinate?.join('，')}；核验日期 {selected.checkedAt}。</p>{[...selected.identitySources, ...selected.geographySources].map(s => <p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></p>)}</details></section>;
  const journey = <section className="journey-panel" data-testid="journey-summary" data-start={from} data-end={to}>
    <p className="soft-note">道路研究方案 · 尚未核验开通</p>
    <div className="endpoint-selectors"><label>起点古村<select aria-label="起点古村" value={from} onChange={e => { setFrom(e.target.value); if (e.target.value === to) setTo(''); }}><option value="">请选择起点</option>{mapVillages.map(v => <option key={v.id} value={v.id}>{v.displayName}</option>)}</select></label><label>终点古村<select aria-label="终点古村" value={to} onChange={e => setTo(e.target.value)}><option value="">请选择终点</option>{mapVillages.filter(v => v.id !== from).map(v => <option key={v.id} value={v.id}>{v.displayName}</option>)}</select></label></div>
    <div className="direction-controls" aria-label="区间方向"><button aria-pressed={direction === 'outbound'} onClick={() => setDirection('outbound')}>去程</button><button aria-pressed={direction === 'return'} onClick={() => setDirection('return')}>返程</button></div>
    <div className="route-readout" data-testid="route-status" data-route-id={currentRoute?.id ?? ''} data-geometry-status={currentRoute?.geometryStatus ?? 'unavailable'} aria-live="polite">
      {!from || !to ? <p>选好起点和终点，再查看道路方案。</p> : researchError ? <><p>道路数据暂时无法载入，古村资料仍可查看。</p><button onClick={() => setAttempt(a => a + 1)}>重新载入道路数据</button></> : !research ? <p>正在载入道路研究资料…</p> : !currentRoute?.coordinates ? <p>{currentRoute?.unavailableReason ?? '现有道路样本无法连接这两个参考点。'}</p> : <><h3>{nameOf(routeFrom)} → {nameOf(routeTo)}</h3><strong className="route-distance">{((currentRoute.distanceMeters ?? 0) / 1000).toFixed(1)} <span>公里</span></strong><p>样本道路长度 · 无可靠行程时长</p><p className="soft-note">路网不完整，可能绕行；不代表最短路线或公交可通行。</p></>}
    </div>
    {currentRoute?.coordinates && <><button className="primary" onClick={() => { setScope('route'); navigate('ride'); }}>在地图上查看<Glyph name="arrow"/></button><button className="save-plan" onClick={savePlan}>保存本地研究计划</button><details><summary>道路参考点与限制</summary>{research?.suggestions.filter(p => p.villageId === from || p.villageId === to).map(p => <p key={p.id}>{nameOf(p.villageId)}：参考道路点与村落代表点直线相隔约 {p.straightLineOffsetMeters} 米。之间通路与上下客条件均未核验。</p>)}<p>去返程按有向道路分别计算。来源：OpenStreetMap 本地样本；时长未知，尚无运营班次。</p></details></>}
    {notice && <p role="status" className="inline-notice">{notice}</p>}
    {savedPlan && <div className="saved-plan" data-testid="saved-plan"><strong>这台设备上的研究计划</strong><p>{nameOf(savedPlan.from)} → {nameOf(savedPlan.to)}</p><p>非正式线路 · {savedPlan.savedAt.slice(0, 10)}</p><button onClick={() => { setFrom(savedPlan.from); setTo(savedPlan.to); setDirection(savedPlan.direction); setNotice(research?.version === savedPlan.dataVersion ? '已恢复本地计划。' : '数据版本有变化，已按当前道路样本重新查看。'); }}>恢复这个计划</button></div>}
  </section>;
  const depthControls = <div className="depth-controls" data-testid="map-view" data-mode={depth} aria-label="地图视角"><button aria-pressed={depth === 'flat'} onClick={() => setDepth('flat')}>平面</button><button aria-pressed={depth === 'relief'} onClick={() => setDepth('relief')}>立体</button></div>;
  const mapControls = <div className="map-command-bar"><div className="scope-controls" data-testid="map-scope" data-scope={scope} aria-label="地图范围">{([{ id: 'county', label: '全县' }, { id: 'route', label: '区间' }, { id: 'village', label: '村内' }] as const).map(item => <button key={item.id} aria-pressed={scope === item.id} onClick={() => chooseScope(item.id)}>{item.label}</button>)}</div><button className="expand-map" aria-label={fullscreen ? '退出全屏地图' : '全屏地图'} onClick={() => setFullscreen(v => !v)}><Glyph name={fullscreen ? 'close' : 'scan'}/></button></div>;
  return <div className={`geography-app mobile-product size-${preferences.size} ${large ? 'large-type' : ''} ${preferences.senior ? 'senior-mode' : ''} ${fullscreen ? 'map-is-fullscreen' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>跳到主要内容</a>
    <header className="app-header"><a className="brand" href="#/ride"><strong className="xiangxu-wordmark">{product.name}</strong><span className="brand-strap">{product.serviceName}<small>{product.region}</small></span></a><button className="settings-trigger" onClick={() => setSheet('settings')}><Glyph name="sun"/><span>设置</span></button><button className="menu-toggle" ref={menuButton} aria-label="打开右侧导航" aria-expanded={drawer} onClick={() => setDrawer(true)}><Glyph name="help"/><span>菜单</span></button></header>
    <div className="mobile-hero"><div><p className="eyebrow">{view === 'return' ? '去有方向 · 回有准备' : view === 'help' ? '慢一点，也从容' : '一方水土 · 一程风景'}</p><h1>{view === 'return' ? '安心回' : view === 'help' ? '用得简单' : view === 'town' ? '识古村' : '去古村'}</h1></div><div className="font-controls" aria-label="字体大小">{([{ id: 'small', label: '小' }, { id: 'medium', label: '中' }, { id: 'large', label: '大' }] as const).map(item => <button key={item.id} aria-pressed={preferences.size === item.id} onClick={() => savePreferences({ size: item.id })}>{item.label}</button>)}</div></div>
    {preferences.storageError && <p className="inline-notice" role="status">设置仅在本次使用中生效，浏览器暂时无法保存。</p>}
    <div className="app-layout"><main id="main-content" tabIndex={-1}>
      {view === 'ride' && <>
        <section className="sculpt-shell">
          <svg className="sculpt-crown" viewBox="0 0 320 42" preserveAspectRatio="none" aria-hidden="true"><path d="M0 42C0 15 16 0 43 0H103C136 0 137 26 179 26H286Q320 26 320 42Z"/></svg>
          <div className="village-summary" data-selected-village-id={selectedId}><div className="selected-top">{preferences.senior ? <span>古村位置</span> : !fullscreen && depthControls}<button onClick={() => setSheet('villages')}>换村<Glyph name="swap"/></button></div><h2>{selected.displayName}</h2><p>{selected.township} · 上下客点未核验</p></div>
          {preferences.senior ? <div className="senior-choice"><button className="primary" onClick={() => setSheet('villages')}>选择要去的古村<Glyph name="arrow"/></button><p>{to ? `目的地：${nameOf(to)}。下一步选择从哪里出发。` : '先选要去的村，再安排出发。'}</p><button className="senior-details" onClick={() => setSheet('details')}>查看村落说明<Glyph name="chevron"/></button></div> : <div className={`map-stage ${fullscreen ? 'is-fullscreen' : ''}`}>
            {fullscreen && depthControls}
            {mapControls}<Suspense fallback={<section className="map-card map-loading" role="status">正在载入地图…</section>}><GeographyMap selectedId={selectedId} onSelect={setSelectedId} reducedMotion={reducedMotion} large={large} scope={scope} depth={depth} route={mapRoute} boardingPoints={referencePoints} onDepthChange={setDepth}/></Suspense>
            {fullscreen && <button className="fullscreen-villages" onClick={() => setSheet('villages')}>选择古村 · {selected.displayName}</button>}
          </div>}
          <div className="sculpt-foot"><span>村落点 · 非站点</span><button onClick={() => setSheet('details')}>查看村落<Glyph name="chevron"/></button></div>
        </section>
        <div className="notch-action"><button onClick={() => setSheet('villages')}><Glyph name="pin"/><span>选择古村</span><Glyph name="chevron"/></button></div>
        <button className="journey-card" onClick={() => { setNotice(''); setSheet('journey'); }}><span className="journey-card-copy"><small>把归途，也放心上</small><strong>安排这一程</strong><span>{from && to ? `${nameOf(routeFrom)} → ${nameOf(routeTo)}` : '道路方案 · 未核验开通'}</span></span><span className="journey-card-arrow"><Glyph name="arrow"/></span></button>
      </>}
      {view === 'town' && <div className="content-page">{villageList}{details}<details className="pending-list"><summary>其他候选村落</summary>{villages.filter(v => !v.normalizedCoordinate).map(v => <div key={v.id}><strong>{v.displayName}</strong><p>{v.notes}</p></div>)}</details></div>}
      {view === 'return' && <div className="content-page"><p className="return-notice">返程站点与末班车尚未确认。出行前请向当地运营方核实。</p>{journey}</div>}
      {view === 'help' && <div className="content-page">{settings}<section className="help-copy"><h2>先认识古村，再安排出行</h2><ol><li>选择要去的古村。</li><li>设定起点、终点，查看道路研究方案。</li><li>向运营方确认站点与班次后再出发。</li></ol><details><summary>地图与数据说明</summary><p>古村代表点、道路参考点和正式公交站是不同对象。当前没有确认的运营班次。</p><p>立体模式采用真实平面坐标和轻俯视角；没有高程数据。建筑覆盖有限，有轮廓的建筑使用示意高度。</p><p>资料核验日期：{product.checkedAt}。地图保留 OpenStreetMap 署名，不读取或上传您的位置。</p></details></section></div>}
      <footer className="page-footer"><span>{product.name} · 宁海</span><span>研究预览，非候车依据</span></footer>
    </main><aside className="desktop-navigation"><GrooveNavigation items={items} active={view} onSelect={navigate} reducedMotion={reducedMotion} caption="慢行" wordmark={product.name}/></aside></div>
    {sheet && <SheetPanel title={sheet === 'villages' ? '想去哪个古村' : sheet === 'details' ? '古村小记' : sheet === 'settings' ? '阅读与使用设置' : '安排这一程'} onClose={() => setSheet(null)}>{sheet === 'villages' ? villageList : sheet === 'details' ? details : sheet === 'settings' ? settings : journey}</SheetPanel>}
    {drawer && <dialog ref={menu} className="navigation-drawer" aria-label="右侧导航菜单" onCancel={() => setDrawer(false)}><button className="drawer-close" onClick={() => setDrawer(false)}>关闭<Glyph name="close"/></button>{items.map(item => <button key={item.id} aria-current={item.id === view ? 'page' : undefined} onClick={() => navigate(item.id)}><Glyph name={item.icon}/>{item.label}</button>)}</dialog>}
  </div>;
}
