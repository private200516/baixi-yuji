import { useEffect, useId, useRef, useState } from 'react';
import { mapVillages } from '../data/villages';
import { getPoiById, getVillagePois, poiCategoryLabels } from '../geography/poiCatalog';
import type { VillagePoi } from '../geography/poiCatalog';
import { hasClosedTravelLoop } from '../geography/travelLoop';
import type { TravelLoop } from '../geography/travelLoop';
import { SheetPanel } from './SheetPanel';
import { Glyph } from './TransitArt';
import { localChineseVoice } from './localSpeech';

export type GuidePanel = { kind: 'loop' } | { kind: 'list'; ids?: string[] } | { kind: 'poi'; id: string } | null;

/** One same-URL history entry: the phone Back action closes the guide first. */
export function useGuidePanel() {
  const [panel, update] = useState<GuidePanel>(null);
  const current = useRef<GuidePanel>(null), closing = useRef(false), token = useId();
  function setPanel(value: GuidePanel) {
    // Forward may revisit the old same-URL entry after its dialog was closed.
    // Reuse it, so the next Back still reaches the map in one step.
    if (value && !current.current && history.state?.townGuide !== token) history.pushState({ ...history.state, townGuide: token }, '', location.href);
    current.current = value; update(value);
  }
  function close() {
    if (closing.current) return;
    if (history.state?.townGuide === token) { closing.current = true; history.back(); }
    else { current.current = null; update(null); }
  }
  useEffect(() => {
    const pop = () => { if (history.state?.townGuide !== token) { closing.current = false; current.current = null; update(null); } };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [token]);
  return { panel, setPanel, close };
}

function PoiIntroduction({ poi }: { poi: VillagePoi }) {
  const [speaking, setSpeaking] = useState(false), [message, setMessage] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const villageName = mapVillages.find(item => item.id === poi.villageId)?.displayName ?? '所属古村待核验';
  const stop = () => {
    if (utterance.current) {
      utterance.current.onend = null; utterance.current.onerror = null;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      utterance.current = null;
    }
    setSpeaking(false);
  };
  useEffect(() => () => {
    if (utterance.current) {
      utterance.current.onend = null; utterance.current.onerror = null;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  }, []);
  function listen() {
    if (speaking) { stop(); return; }
    const result = localChineseVoice();
    if ('error' in result) { setMessage(result.error); return; }
    const speech = new SpeechSynthesisUtterance(`${poi.officialName}。${villageName}。${poi.summary || '简介资料待补充。'}${poi.publicAccessNote}`);
    utterance.current = speech; speech.lang = 'zh-CN'; speech.voice = result.voice; speech.rate = .85;
    speech.onend = () => { if (utterance.current === speech) { utterance.current = null; setSpeaking(false); } };
    speech.onerror = () => { if (utterance.current === speech) { utterance.current = null; setSpeaking(false); setMessage('朗读暂不可用，请查看下方文字。'); } };
    try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(speech); setSpeaking(true); setMessage(''); }
    catch { utterance.current = null; setSpeaking(false); setMessage('朗读暂不可用，请查看下方文字。'); }
  }
  const sources = [...new Map([...poi.identitySources, ...poi.summarySources, ...poi.coordinateSources].map(source => [source.url, source])).values()];
  return <article className="poi-introduction" data-poi-id={poi.id}>
    <p className="guide-meta">{villageName} · {poiCategoryLabels[poi.category]}</p>
    {poi.image && !imageFailed && <figure className="guide-photo"><img src={poi.image.src} alt={poi.image.alt} onError={() => setImageFailed(true)}/><figcaption>{poi.image.author} · {poi.image.license}</figcaption></figure>}
    {imageFailed && <p className="guide-note">图片暂未加载，文字介绍仍可阅读。</p>}
    <p className="poi-summary">{poi.summary || '简介资料待补充。'}</p>
    <p className="guide-access"><Glyph name="pin"/><span>{poi.publicAccessNote || '开放情况尚未核实，请尊重住户与现场管理。'}</span></p>
    {!poi.normalizedCoordinate && <p className="guide-note">位置待核验，暂未在地图落点。</p>}
    <button className="sheet-primary guide-listen" onClick={listen} aria-pressed={speaking}><Glyph name="volume"/>{speaking ? '停止朗读' : '听一遍'}</button>
    {message && <p className="guide-message" role="status">{message}</p>}
    <details className="guide-sources"><summary>资料来源与核验说明</summary><p>核验日期：{poi.checkedAt}。{poi.coordinatePrecisionNote}</p>
      <ul>{sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>{source.location && <small>{source.location}</small>}</li>)}</ul>
      {!poi.image && <p>尚无可追溯的代表照片，本次不展示图片。</p>}
    </details>
  </article>;
}

export function TownGuide({ panel, selected, loop, loopStatus, onRetry, onClose, onOpen, onVillage, reducedMotion, fallbackFocus }: {
  panel: GuidePanel; selected: string; loop: TravelLoop | null; loopStatus: string;
  onRetry: () => void; onClose: () => void; onOpen: (panel: GuidePanel) => void;
  onVillage: (id: string) => void; reducedMotion: boolean; fallbackFocus?: () => HTMLElement | null;
}) {
  const village = mapVillages.find(item => item.id === selected)!;
  const poi = panel?.kind === 'poi' ? getPoiById(panel.id) : undefined;
  const verifiedPoi = poi && poi.villageId === selected && poi.verificationStatus.identity === 'verified' && poi.verificationStatus.summary === 'verified' ? poi : undefined;
  const list = getVillagePois(selected).filter(item => panel?.kind !== 'list' || !panel.ids || panel.ids.includes(item.id));
  const title = panel?.kind === 'poi' ? verifiedPoi?.officialName ?? '景点资料暂不可用' : panel?.kind === 'loop' ? '五村环游' : `${village.displayName}景点`;
  const closed = hasClosedTravelLoop(loop);
  return <SheetPanel open={!!panel} title={title} onClose={onClose} reducedMotion={reducedMotion} unmountOnClose trapFocus fallbackFocus={fallbackFocus}>
    <div className="town-guide-content">
      {panel?.kind === 'poi' ? verifiedPoi ? <PoiIntroduction key={verifiedPoi.id} poi={verifiedPoi}/> : <p className="guide-note">此地点不存在或资料尚未核验，请返回景点清单查看其他地点。</p> : panel?.kind === 'loop' ? <>
        <p className="guide-meta">规划环线 · 非运营信息</p>
        <p className="poi-summary">{closed ? `按以下顺序浏览五座古村，沿样本道路回到浏览起点。道路几何约 ${(loop!.distanceMeters! / 1000).toFixed(1)} 公里，车站、班次和大客车通行条件待核验。` : loopStatus === 'error' ? '环线资料暂未加载。古村与景点介绍仍可浏览。' : loop ? '环线闭合路段待核验。地图仅展示已有道路，不画闭合连线，不计算完整里程。' : '正在核对环线道路资料；闭合路段未核验前，不显示完整里程。'}</p>
        {loopStatus === 'error' && <button className="guide-secondary" onClick={onRetry}>重新加载环线</button>}
        <ol className="guide-village-order">{(loop?.orderedVillageIds ?? mapVillages.map(item => item.id)).map((id, index) => {
          const item = mapVillages.find(entry => entry.id === id)!;
          const pois = getVillagePois(id);
          return <li key={id}><button onClick={() => { onVillage(id); onClose(); }}><b>{index + 1}</b><span><strong>{item.displayName}</strong><small>{index === 0 ? '浏览起点 · ' : ''}{pois.length} 处已核验介绍</small></span><Glyph name="chevron"/></button></li>;
        })}</ol>
        {closed && <p className="guide-loop-return">↳ 回到浏览起点 · {mapVillages.find(item => item.id === loop!.orderedVillageIds[0])?.displayName}</p>}
        <p className="guide-note">编号只表示建议游览顺序，不是公交站号。反向道路尚未作为完整环线独立核验。</p>
        {loop && <details className="guide-sources"><summary>道路依据与待核验事项</summary><p>资料核验：{loop.checkedAt} · {loop.version}</p><ul>{loop.unresolvedIssues.map(issue => <li key={issue}>{issue}</li>)}</ul><a href={loop.attributionUrl} target="_blank" rel="noreferrer">{loop.attribution}</a></details>}
      </> : <>
        <p className="guide-meta">首批代表点 · 非完整名录</p>
        <p className="guide-note">点击名称即可阅读介绍。位置待核验的地点保留在清单中，不作为地图标记或导航入口。</p>
        {list.length ? <ul className="guide-poi-list">{list.map(item => <li key={item.id}><button onClick={() => onOpen({ kind: 'poi', id: item.id })}>
          <span className="guide-category-icon"><Glyph name={item.category === 'agricultural-heritage' ? 'sun' : 'town'}/></span><span><strong>{item.officialName}</strong><small>{poiCategoryLabels[item.category]} · {item.normalizedCoordinate ? '资料代表点' : '位置待核验'}</small></span><Glyph name="chevron"/>
        </button></li>)}</ul> : <p className="guide-empty">这个古村的景点资料正在核验。暂不展示未经证实的名称或坐标。</p>}
      </>}
      {panel?.kind === 'poi' && <button className="guide-secondary" onClick={() => onOpen({ kind: 'list' })}>查看本村其他景点<Glyph name="chevron"/></button>}
    </div>
  </SheetPanel>;
}
