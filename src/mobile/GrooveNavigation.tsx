import { useLayoutEffect, useRef } from 'react';
import { Glyph } from './TransitArt';
import type { GlyphName } from './TransitArt';

type Item<T extends string> = { id: T; label: string; icon: GlyphName };

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

export function GrooveNavigation<T extends string>({ items, active, onSelect, reducedMotion }: {
  items: Item<T>[]; active: T; onSelect: (id: T) => void; reducedMotion: boolean;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const circle = useRef<SVGCircleElement>(null);
  const frame = useRef(0);
  const position = useRef<number | null>(null);
  const index = items.findIndex(item => item.id === active);

  useLayoutEffect(() => {
    const element = rail.current!;
    const systemMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let size = { width: element.clientWidth, height: element.clientHeight };
    function render(y: number) {
      position.current = y;
      path.current!.setAttribute('d', outline(size.width, size.height, y));
      path.current!.dataset.center = String(y);
      circle.current!.setAttribute('cy', String(y));
      circle.current!.setAttribute('cx', String(size.width * .30));
      circle.current!.setAttribute('r', String(size.width * .28));
    }
    function move(animate: boolean) {
      cancelAnimationFrame(frame.current);
      size = { width: element.clientWidth, height: element.clientHeight };
      svg.current!.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
      const padding = parseFloat(getComputedStyle(element).paddingTop);
      const step = (size.height - padding * 2) / items.length;
      const target = padding + (index + .5) * step;
      if (!animate || reducedMotion || systemMotion.matches || position.current === null) { render(target); return; }
      const start = position.current;
      const startTime = performance.now();
      function tick(now: number) {
        const progress = Math.min(1, (now - startTime) / 480);
        render(start! + (target - start!) * ease(progress));
        if (progress < 1) frame.current = requestAnimationFrame(tick);
        else render(target);
      }
      frame.current = requestAnimationFrame(tick);
    }
    move(true);
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== size.width || element.clientHeight !== size.height) move(false);
    });
    observer.observe(element);
    const onMotion = () => move(false);
    systemMotion.addEventListener('change', onMotion);
    return () => { cancelAnimationFrame(frame.current); observer.disconnect(); systemMotion.removeEventListener('change', onMotion); };
  }, [index, items.length, reducedMotion]);

  return <nav className="side-nav groove-nav" aria-label="主要导航">
    <span className="rail-caption">慢行</span>
    <div className="rail-buttons groove-rail" ref={rail}>
      <svg className="groove-shape" ref={svg} aria-hidden="true">
        <path className="groove-outline" ref={path}/>
        <circle className="groove-disc" ref={circle}/>
      </svg>
      {items.map(item => <button key={item.id} className={`groove-item ${item.id === active ? 'active' : ''}`} aria-current={item.id === active ? 'page' : undefined} onClick={() => onSelect(item.id)}>
        <span className="groove-symbol"><Glyph name={item.icon}/><span>{item.label}</span></span>
      </button>)}
    </div>
    <span className="rail-end-line"/><span className="rail-wordmark">BAIXI</span>
  </nav>;
}
