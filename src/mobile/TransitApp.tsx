import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DotLandscape, Glyph, landmarks, RiverMark, RouteRiver, TownMap, TransitMark } from './TransitArt';
import type { GlyphName } from './TransitArt';
import { GrooveNavigation } from './GrooveNavigation';
import { FontSizeControl } from './FontSizeControl';
import { SeniorExperience } from './SeniorExperience';

const screens = ['ride', 'return', 'scan', 'route', 'ticket', 'town', 'help', 'delay'] as const;
type Screen = typeof screens[number];
type Size = 'S' | 'M' | 'L';
type Sheet = 'nearby' | 'saved' | 'orders' | 'contact' | 'faq' | 'settings' | 'times' | null;
type Prefs = { size: Size; regularSize: Size; senior: boolean; favorite: boolean; savedReturn: string | null; quiet: boolean };
const STORE = 'baixi.mobile.v2';
const defaults: Prefs = { size: 'M', regularSize: 'M', senior: false, favorite: false, savedReturn: null, quiet: false };
function readPrefs(): Prefs {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || '{}');
    return { size: ['S', 'M', 'L'].includes(data?.size) ? data.size : 'M', regularSize: ['S', 'M', 'L'].includes(data?.regularSize) ? data.regularSize : 'M', senior: data?.senior === true, favorite: data?.favorite === true, savedReturn: ['17:30', '18:00', '18:30'].includes(data?.savedReturn) ? data.savedReturn : null, quiet: data?.quiet === true };
  } catch { return defaults; }
}
function readScreen(): Screen { const value = location.hash.replace('#/', ''); return screens.includes(value as Screen) ? value as Screen : 'ride'; }
const stations = ['溪畔站', '青云路站', '东湖站', '城南客运站'];
const returnStops = ['古镇起点站', '南门站', '老街站', '东湖站', '市政府站', '城区终点站'];
const labels: Record<Screen, string> = { ride: '找站候车', return: '安心返程', scan: '扫码乘车', route: '线路详情', ticket: '电子车票', town: '古镇导览', help: '帮助中心', delay: '出行提醒' };
const faqs = [
  ['如何使用乘车码？','点击右侧“乘车码”，上车后将二维码对准车载扫码区。本原型展示演示码，不能实际乘车或支付。'],
  ['怎样提前安排返程？','在“返程”选择班次，点击“保存这趟返程”。返程卡保存在此浏览器，不发送到站或发车提醒。'],
  ['怎样让文字更大？','点击右上方“大”，所有页面的文字都会放大。也可以打开“设置”，开启老年人模式，使用更简单的大按钮页面。字号会保存在当前浏览器。'],
];
const nav: { id: Screen; label: string; icon: GlyphName }[] = [{ id:'ride', label:'候车', icon:'bus' },{ id:'return', label:'返程', icon:'back' },{ id:'scan', label:'乘车码', icon:'scan' },{ id:'town', label:'古镇', icon:'town' },{ id:'help', label:'帮助', icon:'help' }];

function SheetPanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current!; const trigger = document.activeElement as HTMLElement; el.showModal(); return () => { el.close(); if (trigger?.isConnected) trigger.focus(); }; }, []);
  return <dialog ref={ref} className="sheet-panel" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }} aria-labelledby="sheet-title">
    <div className="sheet-handle" aria-hidden="true"/><div className="sheet-top"><div><span className="mini-eyebrow">白溪舆记 / 服务</span><h2 id="sheet-title">{title}</h2></div><button className="sheet-close" onClick={onClose} aria-label="关闭弹窗" autoFocus><Glyph name="close"/><span>关闭</span></button></div>{children}
  </dialog>;
}

export default function TransitApp() {
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState('');
  const [reverse, setReverse] = useState(false);
  const [station, setStation] = useState(stations[0]);
  const [slot, setSlot] = useState(() => readPrefs().savedReturn || '17:30');
  const [query, setQuery] = useState('');
  const [landmark, setLandmark] = useState(0);
  const [faq, setFaq] = useState(0);
  const [ticketVersion, setTicketVersion] = useState(1);
  const [retrying, setRetrying] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const route = reverse ? [...stations].reverse() : stations;
  const destination = route[3];
  const minutes = station === '青云路站' ? 5 : station === '东湖站' ? 8 : 3;
  const active = screen === 'route' || screen === 'delay' ? 'ride' : screen === 'ticket' ? 'scan' : screen;

  useEffect(() => {
    const onHash = () => { setScreen(readScreen()); setSheet(null); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.title = `白溪舆记 · ${labels[screen]}`;
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [screen]);
  useEffect(() => { if (!toast || prefs.senior) return; const timer = setTimeout(() => setToast(''), 4200); return () => clearTimeout(timer); }, [toast, prefs.senior]);
  useEffect(() => {
    document.documentElement.dataset.motion = prefs.quiet || prefs.senior ? 'reduced' : 'full';
    document.documentElement.dataset.textSize = prefs.size;
    document.documentElement.dataset.senior = String(prefs.senior);
  }, [prefs.quiet, prefs.size, prefs.senior]);
  useEffect(() => () => { clearTimeout(retryTimer.current); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);
  useEffect(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    if (prefs.senior && !['ride', 'return', 'scan', 'help'].includes(screen)) location.hash = '/ride';
  }, [screen, prefs.senior]);
  function go(next: Screen) { if (screen === next) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); else location.hash = `/${next}`; setSheet(null); }
  function save(next: Partial<Prefs>, message?: string) {
    const value = { ...prefs, ...next }; setPrefs(value);
    try { localStorage.setItem(STORE, JSON.stringify(value)); if (message) setToast(message); }
    catch { setToast('本机暂时无法保存，更改在本次打开期间有效。'); }
  }
  function changeDirection() { setReverse(value => !value); setStation(reverse ? stations[0] : stations[3]); }
  function toggleSenior(enabled: boolean) {
    save(enabled ? { senior: true, regularSize: prefs.size, size: 'L' } : { senior: false, size: prefs.regularSize });
    setToast(''); go('ride');
  }
  function chooseStation(name: string) {
    setStation(name);
    if (name === stations[3]) setReverse(true);
    else if (name === stations[0]) setReverse(false);
    go('ride');
  }
  function listen() {
    if (!('speechSynthesis' in window)) { setToast('当前设备不支持朗读，可以在设置中选择大字号。'); return; }
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith('zh') && v.localService);
    if (!voice) { setToast('这台设备暂不能朗读，请查看页面文字，或请身边的人帮忙。'); return; }
    const message = prefs.senior && screen === 'scan' ? '上车时出示乘车码。当前为演示码，不能用于乘车。真实乘车请按司机指引购票。' : prefs.senior && screen === 'return' ? `返程在古镇起点站上车，返回城区终点站，出发时间${slot}。点击换个时间可以选择班次，点击记住这趟车可以保存。` : prefs.senior && screen === 'help' ? `请找司机或站务人员帮忙。我在${station}，想去${destination}，请帮我确认乘车方向。` : `${station}，开往${destination}。下一班约${minutes}分钟。返程计划${slot}。`;
    const utterance = new SpeechSynthesisUtterance(`白溪舆记。以下为演示信息。${message}出行前请向工作人员确认。`);
    utterance.lang = 'zh-CN'; utterance.voice = voice; utterance.rate = .85;
    utterance.onend = () => setSpeaking(false); utterance.onerror = () => { setSpeaking(false); setToast('朗读暂不可用，请使用大字模式。'); };
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); setSpeaking(true);
  }
  function retry() { setRetrying(true); retryTimer.current = setTimeout(() => { setRetrying(false); go('ride'); setToast('已重新载入演示班次，真实车辆状态尚未接入。'); }, 1000); }
  const action: Record<Screen, { label: string; icon: GlyphName; run: () => void }> = {
    ride: { label: '查找附近站点', icon: 'pin', run: () => { setQuery(''); setSheet('nearby'); } },
    return: { label: prefs.savedReturn === slot ? '查看返程卡' : '保存这趟返程', icon: prefs.savedReturn === slot ? 'ticket' : 'bell', run: () => { if (prefs.savedReturn === slot) setSheet('saved'); else { save({ savedReturn: slot }, `已保存 ${slot} 返程卡到本机`); } } },
    scan: { label: '查看我的车票', icon: 'ticket', run: () => go('ticket') },
    route: { label: '出示乘车码', icon: 'scan', run: () => go('scan') },
    ticket: { label: '我的车票记录', icon: 'ticket', run: () => setSheet('orders') },
    town: { label: '查看公交线路', icon: 'pin', run: () => go('route') },
    help: { label: '联系服务中心', icon: 'help', run: () => setSheet('contact') },
    delay: { label: '查看帮助', icon: 'help', run: () => go('help') },
  };
  const title: Record<Screen, ReactNode> = {
    ride: <><span className="hero-number" key={minutes}>{minutes}</span><span className="hero-unit">分钟</span></>,
    return: <span className="hero-number time-number" key={slot}>{slot}</span>,
    scan: <>乘车码<span className="title-dot">.</span></>,
    route: <><span className="hero-number">5</span><span className="hero-unit">路</span></>,
    ticket: <>一程山水</>, town: <>古镇漫游</>, help: <>在你身边</>, delay: <>稍候片刻</>,
  };

  return <div className="experience">
    <a className="skip-link" href="#main-view">跳到主要内容</a>
    <header className="studio-header"><a href="#/ride" aria-label="白溪舆记首页" className="studio-brand"><RiverMark/><span>白溪舆记<small>BAIXI YUJI</small></span></a><span className="studio-caption">宁海古镇 · 公共交通出行</span><span className="edition">MOBILE EXPERIENCE <i/> 2026</span></header>
    <div className="showcase">
      <aside className="editorial"><div className="edition-line"><span>山水之间，自在出行</span><i/></div><h1>把山水，<br/>装进<span>行程。</span></h1><p className="editorial-description">一程公交，一段古镇时光。<br/>从出发到归途，每一步都从容。</p><div className="scene-selector" aria-label="切换演示界面">{nav.map((item, i) => <button key={item.id} aria-pressed={active === item.id} onClick={() => go(item.id)}><span>0{i + 1}</span>{item.label}<Glyph name={item.icon}/></button>)}</div><div className="design-note"><span className="note-line"/><div><p>沿溪而行 · 从容抵达</p><small>BAIXI YUJI — A SLOWER JOURNEY</small></div><RiverMark/></div></aside>
      <section className="device-stage" aria-label="白溪舆记手机应用">
        <div className={`phone ${prefs.senior ? 'senior-phone' : ''}`}>
          <div className="device-status" aria-hidden="true"><span>9:41</span><span className="dynamic-island"/><span className="status-icons"><svg viewBox="0 0 52 14"><path d="M2 12V9m4 3V7m4 5V4m4 8V1" stroke="currentColor" strokeWidth="2"/><path d="M20 5q6-6 12 0m-10 3q4-4 8 0m-6 3q2-2 4 0" fill="none" stroke="currentColor" strokeWidth="1.5"/><rect x="37" y="3" width="12" height="8" rx="2" stroke="currentColor" fill="none"/><rect x="39" y="5" width="8" height="4" rx="1" fill="currentColor"/><path d="M51 6v2" stroke="currentColor"/></svg></span></div>
          {prefs.senior ? <SeniorExperience screen={screen} station={station} destination={destination} minutes={minutes} slot={slot} savedReturn={prefs.savedReturn} speaking={speaking} onGo={go} onSettings={() => setSheet('settings')} onListen={listen} onStations={() => { setQuery(''); setSheet('nearby'); }} onTimes={() => setSheet('times')} onSave={() => save({ savedReturn: slot })}/> : <div className="phone-scroll" ref={scrollRef}>
            <div className="app-topbar"><span className="location-chip"><Glyph name="pin"/>宁海 · 前童</span><span className="demo-tag"><i/>概念演示</span><button className="app-settings" onClick={() => setSheet('settings')}><Glyph name="settings"/>设置</button></div>
            <main id="main-view" className="mobile-main" tabIndex={-1}>
              <header className="trip-header"><div className="headline" key={screen}><p>{screen === 'ride' ? '下一班 · 预计到站' : screen === 'return' ? '返程出发 · 从容回家' : labels[screen]}</p><h2 className={`hero-title ${['ride','route','return'].includes(screen) ? 'numeric-title' : ''}`}>{title[screen]}</h2></div><button className="route-identity" onClick={() => go('route')} aria-label="查看 5 路线路详情"><TransitMark/><strong>S-384x</strong><span>宁海慢行专线</span></button></header>
              <div className="sculpt-frame" key={screen}>
                <FontSizeControl className="size-controls" value={prefs.size} onChange={size => save({ size })}/>
                <svg className="sculpt-cap" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 100V60C0 25 25 0 65 0H138C192 0 186 56 247 56H339C380 56 400 78 400 100Z"/></svg>
                <div className={`teal-content screen-${screen}`}>
                  {screen === 'ride' && <>
                    <div className="surface-kicker"><span><i className="live-dot"/>5 路 · 候车中</span><button className="surface-icon" aria-label={prefs.favorite ? '取消收藏线路' : '收藏线路'} aria-pressed={prefs.favorite} onClick={() => save({ favorite: !prefs.favorite }, prefs.favorite ? '已取消收藏' : '已收藏 5 路到本机')}><Glyph name="star"/></button></div>
                    <div className="station-heading"><h3>{station}<span>·</span></h3><button className="direction-control" onClick={changeDirection} aria-label="切换行车方向"><Glyph name="swap"/></button></div>
                    <p className="destination">开往{destination}</p>
                    <button className="route-preview" onClick={() => go('route')} aria-label="展开完整线路"><RouteRiver stops={route} reversed={reverse}/></button>
                    <div className="ride-meta"><span><Glyph name="bus"/>距本站 2 站</span><span><i/>示例班次</span><button onClick={() => go('route')}>全程线路<Glyph name="arrow"/></button></div>
                  </>}
                  {screen === 'return' && <>
                    <div className="surface-kicker"><span>去有方向，回有着落</span><Glyph name="back"/></div><h3 className="return-title">古镇起点站 <span>→</span><br/>城区终点站</h3>
                    <ol className="stop-list return-stops">{returnStops.map((stop, i) => <li key={stop} className={i === 0 ? 'current' : ''}><i/><span>{stop}</span>{i === 0 && <small>上车点</small>}{i === 5 && <small>约 35 分钟</small>}</li>)}</ol>
                    <div className="return-slots" role="group" aria-label="选择返程班次">{['17:30','18:00','18:30'].map(time => <button key={time} aria-pressed={slot === time} onClick={() => setSlot(time)}>{time}{time === '18:30' && <small>末班</small>}</button>)}</div><p className="surface-footnote">选择示例班次，保存到本机返程卡</p>
                  </>}
                  {screen === 'scan' && <>
                    <div className="surface-kicker"><span>上车，从这里开始</span><Glyph name="scan"/></div><h3 className="center-title">将乘车码对准扫码区</h3><p className="center-subtitle">靠近车载设备，即可轻松出行</p><div className="scanner"><span className="scan-corner tl"/><span className="scan-corner tr"/><span className="scan-corner bl"/><span className="scan-corner br"/><div className="scanner-code"><img src="./art/demo-qr.svg" alt="无效演示二维码"/><span className="qr-demo">DEMO</span></div><div className="scan-beam"/></div><div className="scan-demo-pill"><i/>演示乘车码 · 不可用于乘车</div><button className="surface-text-button" onClick={() => go('ticket')}>查看电子车票<Glyph name="arrow"/></button>
                  </>}
                  {screen === 'route' && <>
                    <div className="surface-kicker"><span>沿溪而行 · 5 路</span><button className="surface-icon" onClick={changeDirection} aria-label="切换线路方向"><Glyph name="swap"/></button></div><h3 className="route-title">{route[0]}<Glyph name="arrow"/>{destination}</h3><div className="route-chips"><span>全程 4 站</span><span>约 18 分钟</span><span>示例线路</span></div>
                    <ol className="stop-list detail-stops">{route.map((stop,i) => <li key={stop} className={stop === station ? 'current' : ''}><i/><button onClick={() => chooseStation(stop)}><strong>{stop}</strong><small>{stop === station ? '当前候车站点' : i === 3 ? '终点站 · 点击选择' : '点击设为候车站'}</small></button>{stop === station && <span className="here-label">当前站</span>}</li>)}</ol><div className="route-service"><Glyph name="clock"/><span>首班 06:30 <i/> 末班 18:30</span></div><p className="surface-footnote">站点、票价与班次均为设计示例，待核实。</p>
                  </>}
                  {screen === 'ticket' && <>
                    <div className="surface-kicker"><span>把一路风景，收进票根</span><Glyph name="ticket"/></div><article className="paper-ticket"><div className="ticket-heading"><span>白溪舆记 · 电子车票</span><TransitMark/></div><h3>{station}<Glyph name="arrow"/>{destination}</h3><div className="ticket-divider"/><div className="ticket-qr" key={ticketVersion}><img src="./art/demo-qr.svg" alt="演示电子车票二维码，不可用于乘车"/><span className="qr-demo">DEMO</span></div><button className="refresh-code" onClick={() => { setTicketVersion(v => v+1); setToast('演示票面已刷新；此二维码不具备乘车或支付功能。'); }}><Glyph name="refresh"/>刷新演示票面</button><p>样票 NO. 000{ticketVersion} · 未购票</p><div className="ticket-divider"/><div className="ticket-bottom"><span>5 路 · 单程</span><strong>演示票</strong></div></article><p className="surface-footnote">仅供界面体验，不具备支付与核验功能</p>
                  </>}
                  {screen === 'town' && <>
                    <div className="surface-kicker"><span>一站一风景 · 前童</span><span className="map-north">N ↑</span></div><TownMap selected={landmark} onSelect={setLandmark}/><div className="landmark-description" key={landmark}><div><small>{landmarks[landmark].en}</small><h3>{landmarks[landmark].name}<span>漫游停靠点</span></h3></div><p>{landmarks[landmark].desc}</p></div>
                  </>}
                  {screen === 'help' && <>
                    <div className="surface-kicker"><span>每一步，都有人关照</span><Glyph name="heart"/></div><h3 className="help-title">出行小事，<br/>慢慢说。</h3><button className="help-listen" onClick={listen}><Glyph name="volume"/><span>{speaking ? '停止朗读' : '听一遍乘车信息'}<small>使用设备本地中文语音</small></span><Glyph name="chevron"/></button><div className="faq-list">{faqs.map(([question], index) => <button key={question} onClick={() => { setFaq(index); setSheet('faq'); }}>{question}<Glyph name="chevron"/></button>)}</div><label className="motion-setting"><span>减少动态效果<small>保留清晰、安静的浏览体验</small></span><input type="checkbox" checked={prefs.quiet} onChange={e => save({ quiet: e.target.checked })}/><i aria-hidden="true"/></label><button className="surface-text-button" onClick={() => go('delay')}>查看异常状态示例<Glyph name="arrow"/></button>
                  </>}
                  {screen === 'delay' && <div className="delay-state"><div className="waiting-icon"><Glyph name="clock"/><i/><i/></div><h3>好风景，值得稍候。</h3><p>车辆暂时晚点，请稍候。<br/>你可以重新查看班次，或提前安排返程。</p><button className="cream-button" onClick={retry} disabled={retrying}><Glyph name="refresh" className={retrying ? 'spinning' : ''}/>{retrying ? '正在查询…' : '重新查询'}</button><span>异常状态演示 · 并非实时运营通知</span></div>}
                </div>
                <div className="sculpt-tail"><svg viewBox="0 0 400 125" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0H400V4Q400 29 364 29H276C243 29 219 40 219 64S238 96 247 96V99Q247 121 214 121H128C98 121 91 134 75 122C39 109 42 94 42 70V61C42 42 29 35 18 32Q0 28 0 0Z"/></svg><div className="notch-action"><button onClick={action[screen].run}><Glyph name={action[screen].icon}/><span>{action[screen].label}</span><Glyph name="chevron"/></button></div></div>
              </div>
              <div className="lower-landscape"><div className="vertical-signature"><span className="calligraphy">白溪輿記</span><span className="vertical-en">BAIXI YUJI</span><RiverMark/></div><section className="terracotta"><div className="terracotta-inner"><button className="return-mini" onClick={() => go(screen === 'return' ? 'town' : 'return')}><span><small>{screen === 'return' ? '古镇漫游' : prefs.savedReturn ? '已保存返程' : '返程安排'}</small><span className="return-summary"><strong>{screen === 'return' ? '再逛一逛' : prefs.savedReturn || '17:30'}</strong>{screen !== 'return' && <span>古镇 → 城区</span>}</span></span><span className="return-arrow"><Glyph name="arrow"/></span></button><DotLandscape/></div></section></div>
              <GrooveNavigation items={nav} active={active} onSelect={go} reducedMotion={prefs.quiet}/>
              <p className="prototype-note">设计演示 · 站点与时刻待核实 · 非实际出行依据</p>
            </main>
          </div>}
          <div className="home-indicator" aria-hidden="true"/>
          {toast && <div className="toast" role="status"><Glyph name="check"/><span>{toast}</span><button onClick={() => setToast('')} aria-label="关闭提示">{prefs.senior ? '知道了' : <Glyph name="close"/>}</button></div>}
        </div><div className="device-caption"><span>0{screens.indexOf(screen)+1} / {labels[screen]}</span><span>可交互预览 <i/></span></div>
      </section>
      <aside className="margin-note"><span>一方水土</span><i/><span>一程风景</span><small>30° N / 121° E</small></aside>
    </div>
    <footer className="studio-footer"><span>为慢一点的旅行，设计刚刚好的抵达。</span><div><i/><i/><i/><span>宁海 · 中国</span></div></footer>
    {sheet && <SheetPanel title={sheet === 'settings' ? '设置' : sheet === 'times' ? '选择出发时间' : sheet === 'nearby' ? '选一个上车站' : sheet === 'saved' ? '归途，已经记下' : sheet === 'orders' ? '我的车票' : sheet === 'faq' ? '出行小贴士' : '出行服务'} onClose={() => setSheet(null)}>
      {sheet === 'settings' && <div className="settings-content">
        <section className="settings-font"><h3>文字大小</h3><p>所有页面一起调整</p><FontSizeControl value={prefs.size} onChange={size => save({ size })}/></section>
        <div className="settings-senior"><div><Glyph name="heart"/><h3>老年人模式</h3></div>{prefs.senior ? <p>四个大按钮，操作更简单。</p> : <p>更少选项 · 更大按钮<br/>候车、乘车码、返程和求助，一眼就能找到。</p>}<button className="senior-mode-switch" role="switch" aria-checked={prefs.senior} aria-label="老年人模式" onClick={() => toggleSenior(!prefs.senior)}><span>{prefs.senior ? '退出老年人模式' : '开启老年人模式'}</span><span className="setting-switch-track" aria-hidden="true"><i/></span></button></div>
        {!prefs.senior ? <label className="settings-motion"><span>减少动态效果</span><input type="checkbox" checked={prefs.quiet} onChange={e => save({ quiet: e.target.checked })}/></label> : <p className="settings-tip">退出后恢复原来的字号。</p>}
      </div>}
      {sheet === 'times' && <div className="senior-time-list">{['17:30', '18:00', '18:30'].map(time => <button key={time} aria-pressed={slot === time} onClick={() => { setSlot(time); setSheet(null); }}><span>{time}{time === '18:30' && <small>末班</small>}</span>{slot === time ? <Glyph name="check"/> : <Glyph name="chevron"/>}</button>)}</div>}
      {sheet === 'faq' && <div className="faq-answer"><Glyph name="help"/><h3>{faqs[faq][0]}</h3><p>{faqs[faq][1]}</p><button className="sheet-primary" onClick={() => setSheet(null)}>知道了<Glyph name="check"/></button></div>}
      {sheet === 'nearby' && <><p className="sheet-description">当前展示示例站点，尚未接入定位和步行导航。</p><label className="station-search"><Glyph name="search"/><input aria-label="搜索站点" placeholder="搜索站点名称" value={query} onChange={e => setQuery(e.target.value)}/></label><div className="nearby-list">{stations.filter(name => name.includes(query.trim())).map((name,i) => <button key={name} onClick={() => { chooseStation(name); setToast(`已选择 ${name}`); }}><span className="station-pin"><Glyph name="pin"/></span><span><strong>{name}</strong><small>5 路 · 示例站点 {i+1}</small></span>{station === name ? <Glyph name="check"/> : <Glyph name="chevron"/>}</button>)}{!stations.some(name => name.includes(query.trim())) && <div className="empty-state"><Glyph name="search"/><h3>没有找到这个站</h3><p>试试“溪畔”“东湖”或其他站名</p><button onClick={() => setQuery('')}>查看全部站点</button></div>}</div></>}
      {sheet === 'saved' && <><div className="saved-card"><Glyph name="ticket"/><span>我的返程 · 5 路</span><strong>{prefs.savedReturn}</strong><p>古镇起点站 → 城区终点站</p><small>已保存在此浏览器 · 演示班次</small></div><p className="sheet-description">出发前再确认一下班次。本原型不会发送通知。</p><button className="sheet-primary" onClick={() => { save({ savedReturn: null }, '已移除本机返程卡'); setSheet(null); }}>移除返程卡</button></>}
      {sheet === 'orders' && <div className="empty-state"><Glyph name="ticket"/><h3>第一程，还未启程</h3><p>尚无真实购票记录。<br/>你可以先浏览演示车票的样式。</p><button className="sheet-primary" onClick={() => { setSheet(null); go('ticket'); }}>查看演示车票<Glyph name="arrow"/></button></div>}
      {sheet === 'contact' && <div className="empty-state"><Glyph name="help"/><h3>需要一点帮助？</h3><p>本原型尚未接入在线客服与公交服务热线。<br/>实际出行请咨询现场工作人员。</p><button className="sheet-primary" onClick={() => { setSheet(null); go('help'); }}>查看出行帮助<Glyph name="arrow"/></button></div>}
    </SheetPanel>}
  </div>;
}
