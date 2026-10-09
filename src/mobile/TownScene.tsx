import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { boardingPoints, mapVillages } from '../data/villages';
import type { MapRoute } from '../geography/map-depth';
import type { TextSize } from './FontSizeControl';
import { Glyph, TransitMark } from './TransitArt';
import 'maplibre-gl/dist/maplibre-gl.css';

const SceneMap = lazy(() => import('../geography/GeographyMap').then(module => ({ default: module.GeographyMap })));

export default function TownScene({ selected, onSelect, size, reducedMotion, returnTime, returnDirection, route, onRoute, onReturn }: {
  selected: string; onSelect: (id: string) => void; size: TextSize;
  reducedMotion: boolean; returnTime: string; returnDirection: string; route: MapRoute | null;
  onRoute: (villageId: string) => void; onReturn: (villageId: string) => void;
}) {
  const village = mapVillages.find(item => item.id === selected)!;
  const scene = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 190, bottom: 290, left: 24, right: 78 });
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
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
      const next = { top: header.offsetTop + header.offsetHeight + 20,
        bottom: root.clientHeight - dock.offsetTop + 24, left: 24, right: root.clientWidth < 350 ? 70 : 82 };
      setInsets(previous => Object.keys(next).every(key => next[key as keyof typeof next] === previous[key as keyof typeof next]) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    [root, header, dock].forEach(element => observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, []);

  return <div className="town-scene" ref={scene} style={{ '--town-safe-top': `${insets.top}px`, '--town-safe-bottom': `${insets.bottom}px` } as CSSProperties}>
    <div className="town-scene-map">
      <Suspense fallback={<div className="town-map-loading" role="status">正在展开古村地图…</div>}>
        <SceneMap selectedId={selected} onSelect={onSelect} large={size === 'L'} reducedMotion={reducedMotion || systemReduced}
          scope={route?.geometry ? 'route' : 'village'} depth="flat" presentation="scene" viewportInsets={insets} route={route}
          boardingPoints={boardingPoints.filter(point => point.verified).map(point => ({ id: point.id, name: '已核验上下客点', coordinates: point.coordinates, status: 'verified' as const, villageId: point.villageId }))}/>
      </Suspense>
    </div>
    <header className="town-scene-header">
      <div className="town-title-card"><p>古村导览</p><h2>古村漫游</h2></div>
      <button className="town-route-identity" onClick={() => onRoute(selected)} aria-label="查看古村道路研究方案"><TransitMark/><strong>S-384x</strong><span>概念设计题签</span></button>
    </header>
    <div className="town-scene-dock">
      <article className="town-village-card" data-village-id={selected}>
        <div className="town-village-copy" key={selected} aria-live="polite" aria-atomic="true">
          <p>{village.township}</p><h3>{village.displayName}</h3><span>村落点 / 非公交站</span>
        </div>
        <button className="town-route-action" onClick={() => onRoute(selected)}>查看道路方案<Glyph name="chevron"/></button>
      </article>
      <label className="town-village-picker"><span>选择古村</span><span className="town-select-wrap">
        <select aria-label="选择古村" value={selected} onChange={event => onSelect(event.target.value)}>
          {mapVillages.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        </select><Glyph name="chevron"/>
      </span></label>
      <button className="town-return-action" onClick={() => onReturn(selected)} aria-label={`查看古村返程计划，${returnDirection}，班次${returnTime}`}>
        <span>返程</span><strong>{returnTime}</strong><span className="town-return-direction">{returnDirection}</span><Glyph name="arrow"/>
      </button>
    </div>
  </div>;
}
