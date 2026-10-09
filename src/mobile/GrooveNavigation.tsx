import { useLayoutEffect, useRef } from 'react';
import { Glyph } from './TransitArt';
import type { GlyphName } from './TransitArt';

type Item<T extends string> = { id: T; label: string; icon: GlyphName };
type Geometry = { x: number; y: number; width: number; height: number; padding: number };
type Travel<T> = { from: T; to: T; started: number };
const duration = 480;
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;

// A single continuous outline. The four cubic segments keep vertical tangents
// at both shoulders and at the deepest point of the inward-facing groove.
function outline(width: number, height: number, center: number) {
  const left = width * .32;
  const right = width - 1;
  const radius = (right - left) / 2;
  const shoulder = Math.min(width * .59, (height - 32) / 10);
  const depth = width * .34;
  return `M ${left} ${radius}
    Q ${left} 0 ${left + radius} 0
    Q ${right} 0 ${right} ${radius}
    V ${height - radius} Q ${right} ${height} ${right - radius} ${height}
    Q ${left} ${height} ${left} ${height - radius}
    V ${center + shoulder}
    C ${left} ${center + shoulder * .70} ${left + depth * .60} ${center + shoulder * .63} ${left + depth * .80} ${center + shoulder * .43}
    C ${left + depth} ${center + shoulder * .23} ${left + depth} ${center + shoulder * .18} ${left + depth} ${center}
    C ${left + depth} ${center - shoulder * .18} ${left + depth} ${center - shoulder * .23} ${left + depth * .80} ${center - shoulder * .43}
    C ${left + depth * .60} ${center - shoulder * .63} ${left} ${center - shoulder * .70} ${left} ${center - shoulder}
    V ${radius} Z`;
}

// Matches cubic-bezier(.4, 0, .2, 1), also used for each independent icon.
function ease(progress: number) {
  let low = 0, high = 1, t = progress;
  for (let i = 0; i < 12; i++) {
    const x = 3 * (1-t) * (1-t) * t * .4 + 3 * (1-t) * t * t * .2 + t * t * t;
    if (x < progress) low = t; else high = t;
    t = (low + high) / 2;
  }
  return 3 * (1-t) * t * t + t * t * t;
}

export function GrooveNavigation<T extends string>({ items, active, layout, onSelect, reducedMotion, caption = '慢行', wordmark = 'BAIXI' }: {
  items: Item<T>[]; active: T; layout?: string; onSelect: (id: T) => void; reducedMotion: boolean; caption?: string; wordmark?: string;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const circle = useRef<SVGCircleElement>(null);
  const frame = useRef(0);
  const geometry = useRef<Geometry | null>(null);
  const destination = useRef<Geometry | null>(null);
  const layoutTravel = useRef<Travel<Geometry> | null>(null);
  const selection = useRef<number | null>(null);
  const selectionTarget = useRef<number | null>(null);
  const selectionTravel = useRef<Travel<number> | null>(null);
  const index = Math.max(0, items.findIndex(item => item.id === active));

  useLayoutEffect(() => {
    const anchor = slot.current!;
    const element = rail.current!;
    const systemMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let scaleX = 1, scaleY = 1;
    const still = () => reducedMotion || systemMotion.matches;
    const fraction = (index + .5) / items.length;

    // The slot keeps its natural page layout. Only this inner surface moves,
    // so measuring the destination never measures our own animated dimensions.
    function render(now: number) {
      cancelAnimationFrame(frame.current);
      const travel = layoutTravel.current;
      if (travel) {
        const progress = Math.min(1, (now - travel.started) / duration);
        const eased = ease(progress);
        geometry.current = {
          x: mix(travel.from.x, travel.to.x, eased), y: mix(travel.from.y, travel.to.y, eased),
          width: mix(travel.from.width, travel.to.width, eased), height: mix(travel.from.height, travel.to.height, eased),
          padding: mix(travel.from.padding, travel.to.padding, eased),
        };
        if (progress === 1) { geometry.current = travel.to; layoutTravel.current = null; }
      }
      const follower = selectionTravel.current;
      if (follower) {
        const progress = Math.min(1, (now - follower.started) / duration);
        selection.current = mix(follower.from, follower.to, ease(progress));
        if (progress === 1) { selection.current = follower.to; selectionTravel.current = null; }
      }
      const current = geometry.current!, target = destination.current!;
      const width = current.width / scaleX, height = current.height / scaleY, padding = current.padding / scaleY;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      element.style.paddingBlock = `${padding}px`;
      element.style.transform = `translate(${(current.x - target.x) / scaleX}px, ${(current.y - target.y) / scaleY}px)`;
      const y = padding + selection.current! * (height - 2 * padding);
      svg.current!.setAttribute('viewBox', `0 0 ${width} ${height}`);
      path.current!.setAttribute('d', outline(width, height, y));
      path.current!.dataset.center = String(y);
      circle.current!.setAttribute('cy', String(y));
      circle.current!.setAttribute('cx', String(width * .30));
      circle.current!.setAttribute('r', String(width * .28));
      if (layoutTravel.current || selectionTravel.current) frame.current = requestAnimationFrame(render);
    }

    function measure() {
      const bounds = anchor.getBoundingClientRect();
      // Account for the desktop phone preview's CSS zoom without stretching icons.
      scaleX = bounds.width / anchor.offsetWidth || 1;
      scaleY = bounds.height / anchor.offsetHeight || 1;
      const next = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
        padding: parseFloat(getComputedStyle(anchor).getPropertyValue('--groove-padding')) * scaleY };
      const now = performance.now();
      if (!geometry.current || still()) { geometry.current = next; layoutTravel.current = null; }
      else if (!destination.current || (Object.keys(next) as (keyof Geometry)[]).some(key => Math.abs(next[key] - destination.current![key]) > .1)) {
        layoutTravel.current = { from: geometry.current, to: next, started: now };
      }
      destination.current = next;
      if (selection.current === null || still()) { selection.current = fraction; selectionTravel.current = null; }
      else if (selectionTarget.current !== fraction) selectionTravel.current = { from: selection.current, to: fraction, started: now };
      selectionTarget.current = fraction;
      render(now);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    systemMotion.addEventListener('change', measure);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(frame.current); observer.disconnect(); systemMotion.removeEventListener('change', measure); window.removeEventListener('resize', measure); };
  }, [index, items.length, layout, reducedMotion]);

  return <nav className="side-nav groove-nav" aria-label="主要导航">
    <span className="rail-caption">{caption}</span>
    <div className="groove-layout" ref={slot}><div className="rail-buttons groove-rail" ref={rail}>
      <svg className="groove-shape" ref={svg} aria-hidden="true">
        <path className="groove-outline" ref={path}/>
        <circle className="groove-disc" ref={circle}/>
      </svg>
      {items.map(item => <button key={item.id} className={`groove-item ${item.id === active ? 'active' : ''}`} aria-current={item.id === active ? 'page' : undefined} onClick={() => onSelect(item.id)}>
        <span className="groove-symbol"><Glyph name={item.icon}/><span>{item.label}</span></span>
      </button>)}
    </div></div>
    <span className="rail-end-line"/><span className="rail-wordmark">{wordmark}</span>
  </nav>;
}
