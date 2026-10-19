import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { boardingPoints, mapVillages } from '../data/villages';
import type { MapRoute } from '../geography/map-depth';
import type { MapCameraSnapshot } from '../geography/GeographyMap';
import type { TravelLoop } from '../geography/travelLoop';
import { hasClosedTravelLoop } from '../geography/travelLoop';
import { readTravelLoop } from '../geography/loadTravelLoop';
import { getVillagePois } from '../geography/poiCatalog';
import type { TextSize } from './FontSizeControl';
import { Glyph } from './TransitArt';
import { RouteIdentityContent } from './ThemeBus';
import { TownGuide, useGuidePanel } from './TownGuide';
import 'maplibre-gl/dist/maplibre-gl.css';
import './town-guide.css';

const SceneMap = lazy(() => import('../geography/GeographyMap').then(module => ({ default: module.GeographyMap })));
type SceneScope = 'loop' | 'village' | 'route';
// Browsing memory lasts for this open app only; preferences and saved trips stay separate.
let viewSession: { scope: SceneScope; selected: string; camera: MapCameraSnapshot | null; routeId: string | null } | null = null;

export default function TownScene({ selected, onSelect, size, reducedMotion, returnTime, returnDirection, route, onRoute, onReturn, busTheme }: {
  selected: string; onSelect: (id: string) => void; size: TextSize;
  reducedMotion: boolean; returnTime: string; returnDirection: string; route: MapRoute | null;
  onRoute: (villageId: string) => void; onReturn: (villageId: string) => void;
  busTheme: number;
}) {
  const village = mapVillages.find(item => item.id === selected)!;
  const newRoute = !!route?.geometry && route.id !== viewSession?.routeId;
  const [scope, setScope] = useState<SceneScope>(() => newRoute ? 'route' : viewSession?.scope ?? 'loop');
  const [fitRequest, setFitRequest] = useState(0);
  const [loop, setLoop] = useState<TravelLoop | null>(null);
  const [loopStatus, setLoopStatus] = useState('loading'), [attempt, setAttempt] = useState(0);
  const { panel, setPanel, close } = useGuidePanel();
  const restoredCamera = useRef(!newRoute && viewSession?.selected === selected ? viewSession.camera : null);
  const camera = useRef(restoredCamera.current), lastRoute = useRef(viewSession?.routeId ?? null);
  const lastSelected = useRef(selected);
  const view = useRef({ scope, selected }); view.current = { scope, selected };
  const closedLoop = hasClosedTravelLoop(loop);
  const pois = getVillagePois(selected);
  const scene = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 190, bottom: 290, left: 24, right: 78 });
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const controller = new AbortController(); let disposed = false;
    const timer = setTimeout(() => controller.abort(), 10000);
    setLoopStatus('loading');
    void fetch(`${import.meta.env.BASE_URL}geography/travel-loop.json`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Loop unavailable'); return response.json(); })
      .then(readTravelLoop).then(data => {
        if (!disposed) { setLoop(data); setLoopStatus('ready'); }
      }).catch(() => { if (!disposed) { setLoop(null); setLoopStatus('error'); } }).finally(() => clearTimeout(timer));
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [attempt]);
  useEffect(() => {
    if (route?.geometry && route.id !== lastRoute.current) { setScope('route'); setFitRequest(value => value + 1); }
    if (route) lastRoute.current = route.id;
  }, [route]);
  useEffect(() => {
    viewSession = { scope, selected, camera: camera.current, routeId: lastRoute.current };
  }, [scope, selected]);
  useEffect(() => {
    if (lastSelected.current !== selected && panel) close();
    lastSelected.current = selected;
  }, [selected, panel, close]);
  function selectVillage(id: string) { setScope('village'); setFitRequest(value => value + 1); onSelect(id); }
  function overview() { setScope('loop'); setFitRequest(value => value + 1); }
  function rememberCamera(value: MapCameraSnapshot) {
    camera.current = value;
    viewSession = { ...view.current, camera: value, routeId: lastRoute.current };
  }
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    const root = scene.current!;
    const header = root.querySelector<HTMLElement>('.town-scene-header')!;
    const dock = root.querySelector<HTMLElement>('.town-scene-dock')!;
    const measure = () => {
      // Layout coordinates are independent of the cards' entrance transforms.
      const compact = root.clientHeight < 540;
      const next = { top: header.offsetTop + header.offsetHeight + (compact ? 12 : 20),
        bottom: root.clientHeight - dock.offsetTop + (compact ? 12 : 24), left: 24, right: root.clientWidth < 350 ? 70 : scope === 'loop' ? 68 : 82 };
      setInsets(previous => Object.keys(next).every(key => next[key as keyof typeof next] === previous[key as keyof typeof next]) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    [root, header, dock].forEach(element => observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, [scope]);

  return <div className="town-scene" ref={scene} style={{ '--town-safe-top': `${insets.top}px`, '--town-safe-bottom': `${insets.bottom}px` } as CSSProperties}>
    <div className="town-scene-map">
      <Suspense fallback={<div className="town-map-loading" role="status">正在展开古村地图…</div>}>
        <SceneMap selectedId={selected} onSelect={selectVillage} large={size === 'L'} reducedMotion={reducedMotion || systemReduced}
          scope={scope} depth="flat" presentation="scene" viewportInsets={insets} route={route}
          travelLoop={loop} pois={pois} fitRequest={fitRequest} cameraSnapshot={restoredCamera.current} onCameraChange={rememberCamera}
          selectedPoiId={panel?.kind === 'poi' ? panel.id : null}
          onVillageGroupSelect={() => setPanel({ kind: 'loop' })}
          onPoiSelect={ids => setPanel(ids.length === 1 ? { kind: 'poi', id: ids[0] } : { kind: 'list', ids })}
          boardingPoints={boardingPoints.filter(point => point.verified).map(point => ({ id: point.id, name: '已核验上下客点', coordinates: point.coordinates, status: 'verified' as const, villageId: point.villageId }))}/>
      </Suspense>
    </div>
    <header className="town-scene-header">
      <button className="town-title-card town-overview-action" onClick={overview} aria-label="查看完整环线" aria-pressed={scope === 'loop'}><p>查看完整环线<Glyph name="refresh"/></p><h2>古村漫游</h2></button>
      <button className="town-route-identity" onClick={() => onRoute(selected)} aria-label="查看古村道路研究方案"><RouteIdentityContent theme={busTheme}/></button>
    </header>
    <div className="town-scene-dock">
      <article className="town-village-card" data-village-id={selected}>
        <div className={`town-village-copy ${scope === 'loop' ? 'town-loop-copy' : ''}`} key={`${selected}-${scope}`} aria-live="polite" aria-atomic="true">
          <p>{scope === 'loop' ? '规划环线 · 非运营' : village.township}</p><h3>{scope === 'loop' ? '五村环游' : village.displayName}</h3>
          <span>{scope === 'loop' ? closedLoop ? `约 ${(loop!.distanceMeters! / 1000).toFixed(1)} km · 按编号游览` : loopStatus === 'error' ? '环线资料暂未加载' : loop ? '环线闭合路段待核验' : '正在核对道路…' : `村落点 / 非公交站 · ${pois.length} 处介绍`}</span>
        </div>
        <div className="town-card-actions">
          <button className="town-route-action" aria-label={scope === 'loop' ? '环线与游览顺序' : '查看道路方案'} onClick={() => scope === 'loop' ? setPanel({ kind: 'loop' }) : onRoute(selected)}>{scope === 'loop' ? '环线说明' : '道路方案'}<Glyph name="chevron"/></button>
          <button className="town-poi-action" onClick={() => setPanel({ kind: 'list' })}>景点清单<Glyph name="chevron"/></button>
        </div>
      </article>
      <label className="town-village-picker"><span>选择古村</span><span className="town-select-wrap">
        <select aria-label="选择古村" value={selected} onChange={event => selectVillage(event.target.value)}>
          {mapVillages.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        </select><Glyph name="chevron"/>
      </span></label>
      <button className="town-return-action" onClick={() => onReturn(selected)} aria-label={`查看古村返程计划，${returnDirection}，班次${returnTime}`}>
        <span>返程</span><strong>{returnTime}</strong><span className="town-return-direction">{returnDirection}</span><Glyph name="arrow"/>
      </button>
    </div>
    <TownGuide panel={panel} selected={selected} loop={loop} loopStatus={loopStatus} onRetry={() => setAttempt(value => value + 1)}
      onClose={close} onOpen={setPanel} onVillage={selectVillage} reducedMotion={reducedMotion || systemReduced}
      fallbackFocus={() => scene.current?.querySelector<HTMLButtonElement>('.town-overview-action') ?? null}/>
  </div>;
}
