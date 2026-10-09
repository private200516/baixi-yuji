import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export function useReducedMotion(preference: boolean) {
  const [system, setSystem] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystem(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return preference || system;
}

/** Keep navigation live while the previous content leaves. The latest destination wins. */
export function useScreenMotion<T extends string>(initial: () => T, root: RefObject<HTMLElement | null>, reduced: boolean) {
  const [screen, setScreen] = useState(initial);
  const [target, setTarget] = useState(screen);
  const current = useRef(screen), destination = useRef(screen), revision = useRef(0);
  const animations = useRef<Animation[]>([]), outgoing = useRef<HTMLElement[]>([]);
  const clear = useCallback(() => {
    animations.current.forEach(animation => animation.cancel());
    outgoing.current.forEach(element => { element.inert = false; });
    animations.current = []; outgoing.current = [];
    root.current?.removeAttribute('data-transition');
  }, [root]);
  const navigate = useCallback((next: T) => {
    const request = ++revision.current;
    destination.current = next;
    setTarget(next);
    const commit = () => {
      if (request !== revision.current) return;
      current.current = next;
      setScreen(next);
    };
    if (next === current.current || reduced || !root.current || typeof Element.prototype.animate !== 'function') {
      clear(); commit(); return;
    }
    // Retarget an existing departure instead of restarting its timing on rapid taps.
    if (!animations.current.length) {
      root.current.dataset.transition = 'leaving';
      outgoing.current = Array.from(root.current.querySelectorAll<HTMLElement>(':scope > .trip-header > .headline, :scope > .sculpt-frame, :scope > .lower-landscape, :scope > .town-scene'));
      animations.current = outgoing.current.map(element => {
        element.inert = true;
        const opacity = getComputedStyle(element).opacity;
        return element.animate([{ opacity, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-5px)' }],
          { duration: 120, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      });
    }
    void Promise.allSettled(animations.current.map(animation => animation.finished)).then(commit);
  }, [clear, reduced, root]);
  useLayoutEffect(clear, [screen, clear]);
  useEffect(() => { if (reduced && destination.current !== current.current) navigate(destination.current); }, [reduced, navigate]);
  useEffect(() => () => { ++revision.current; clear(); }, [clear]);
  return { screen, target, navigate };
}
