import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GeographyMap, type MapDepth, type MapScope } from '../geography/GeographyMap';
import { mapVillages } from '../data/villages';
import 'maplibre-gl/dist/maplibre-gl.css';
import './geographic-town-map.css';

type Props = { selected: string; onSelect: (id: string) => void; reducedMotion: boolean; large: boolean };

/** Replaces only the old decorative TownMap rectangle; the surrounding app owns navigation and copy. */
export default function GeographicTownMap({ selected, onSelect, reducedMotion, large }: Props) {
  const [scope, setScope] = useState<MapScope>('county');
  const [depth, setDepth] = useState<MapDepth>('flat');
  const wrapper = useRef<HTMLDivElement>(null);
  const [controlHost, setControlHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setControlHost(wrapper.current?.querySelector<HTMLElement>('.map-card') ?? null); }, []);
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const selectedId = mapVillages.some(village => village.id === selected) ? selected : mapVillages[0].id;
  const controls = <div className="legacy-map-controls map-tools">
      <div role="group" aria-label="地图范围">
        <button type="button" aria-pressed={scope === 'county'} onClick={() => setScope('county')}>全县</button>
        <button type="button" aria-pressed={scope === 'village'} onClick={() => setScope('village')}>村内</button>
      </div>
      <div role="group" aria-label="地图视角">
        <button type="button" aria-pressed={depth === 'flat'} onClick={() => setDepth('flat')}>平面</button>
        <button type="button" aria-pressed={depth === 'relief'} onClick={() => setDepth('relief')}>立体</button>
      </div>
    </div>;
  return <div ref={wrapper} className="town-map legacy-town-map" data-selected-village-id={selectedId}>
    {controlHost && createPortal(controls, controlHost)}
    <GeographyMap selectedId={selectedId} onSelect={onSelect} reducedMotion={reducedMotion || systemReduced} large={large} scope={scope} depth={depth} onDepthChange={setDepth}/>
    <label className="legacy-map-villages"><span>选择古村</span><select aria-label="选择古村" value={selectedId} onChange={event => onSelect(event.target.value)}>{mapVillages.map(village => <option key={village.id} value={village.id}>{village.displayName}</option>)}</select></label>
  </div>;
}
