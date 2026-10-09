import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { mapVillages } from '../data/villages';
import type { TextSize } from './FontSizeControl';
import { Glyph, TransitMark } from './TransitArt';
import 'maplibre-gl/dist/maplibre-gl.css';

const SceneMap = lazy(() => import('../geography/GeographyMap').then(module => ({ default: module.GeographyMap })));

export default function TownScene({ selected, onSelect, size, reducedMotion, returnTime, onRoute, onReturn }: {
  selected: string; onSelect: (id: string) => void; size: TextSize;
  reducedMotion: boolean; returnTime: string; onRoute: () => void; onReturn: () => void;
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
          scope="village" depth="flat" presentation="scene" viewportInsets={insets}/>
      </Suspense>
    </div>
    <header className="town-scene-header">
      <div className="town-title-card"><p>古镇导览</p><h2>古镇漫游</h2></div>
      <button className="town-route-identity" onClick={onRoute} aria-label="查看 5 路线路详情"><TransitMark/><strong>S-384x</strong><span>宁海慢行专线</span></button>
    </header>
    <div className="town-scene-dock">
      <article className="town-village-card" data-village-id={selected}>
        <div className="town-village-copy" key={selected} aria-live="polite" aria-atomic="true">
          <p>{village.township}</p><h3>{village.displayName}</h3><span>村落点 / 非公交站</span>
        </div>
        <button className="town-route-action" onClick={onRoute}>查看公交线路<Glyph name="chevron"/></button>
      </article>
      <label className="town-village-picker"><span>选择古村</span><span className="town-select-wrap">
        <select aria-label="选择古村" value={selected} onChange={event => onSelect(event.target.value)}>
          {mapVillages.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        </select><Glyph name="chevron"/>
      </span></label>
      <button className="town-return-action" onClick={onReturn} aria-label={`安排 ${returnTime} 古镇到城区的返程`}>
        <span>返程</span><strong>{returnTime}</strong><span className="town-return-direction">古镇→城区</span><Glyph name="arrow"/>
      </button>
    </div>
  </div>;
}
