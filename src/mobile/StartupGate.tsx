import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './startup.css';

const REVEAL_MS = 640;
type Phase = 'intro' | 'fallback' | 'revealing' | 'done';

/** Mount the real app immediately so the last video frame can dissolve into a ready page. */
export function StartupGate({ children, reducedMotion }: { children: ReactNode; reducedMotion: boolean }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const screen = useRef<HTMLElement>(null);
  const app = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useRef({ time: 0, at: 0 });
  const restoreFocus = useRef(false);
  const setStage = (next: Phase) => { phaseRef.current = next; setPhase(next); };

  const reveal = useCallback((cause: string) => {
    if (phaseRef.current === 'done' || phaseRef.current === 'revealing') return;
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    setReason(cause);
    restoreFocus.current = true;
    // Pausing preserves the decoded last frame throughout the dissolve.
    video.current?.pause();
    setStage('revealing');
  }, []);

  const fallback = useCallback((cause: string) => {
    if (phaseRef.current !== 'intro') return;
    video.current?.pause();
    setFailed(true);
    setReason(cause);
    setStage('fallback');
    fallbackTimer.current = setTimeout(() => reveal(cause), 180);
  }, [reveal]);

  useEffect(() => {
    if (phase !== 'intro') return;
    const media = video.current!;
    let disposed = false;
    const started = performance.now();
    progress.current = { time: 0, at: started };
    screen.current?.focus({ preventScroll: true });
    // Muted inline playback is allowed on mobile; rejection still has a safe exit.
    media.muted = true;
    void media.play().catch(() => { if (!disposed) fallback('playback-blocked'); });
    const watchdog = setInterval(() => {
      const now = performance.now();
      if (now - progress.current.at > 2600 || now - started > 8500) fallback('media-timeout');
    }, 250);
    return () => { disposed = true; clearInterval(watchdog); };
  }, [phase, fallback]);

  useEffect(() => {
    if (phase !== 'revealing') return;
    // The requested film plays on every launch; motion preferences affect only the reveal.
    if (reducedMotion) { setStage('done'); return; }
    revealTimer.current = setTimeout(() => setStage('done'), REVEAL_MS);
    return () => { if (revealTimer.current) clearTimeout(revealTimer.current); };
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (phase !== 'done' || !restoreFocus.current) return;
    restoreFocus.current = false;
    const target = app.current?.querySelector<HTMLElement>('#main-view[tabindex]')
      || app.current?.querySelector<HTMLElement>('.senior-heading h2, .app-settings');
    target?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => () => {
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, []);

  const active = phase !== 'done';
  return <>
    <div ref={app} className="launch-app" data-launch={phase} data-launch-reason={reason || undefined}
      inert={active} aria-hidden={active || undefined}>{children}</div>
    {active && <section ref={screen} tabIndex={-1} className="launch-screen" data-phase={phase} data-failed={failed} role="dialog" aria-modal="true" aria-label="乡序启动动画"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
        if (event.key === 'Tab') { event.preventDefault(); screen.current?.focus({ preventScroll: true }); }
      }}>
      <div className="launch-composition">
        <div className="launch-media" aria-hidden="true">
          <video ref={video} className="launch-video" data-playing={playing} muted playsInline preload="auto" disablePictureInPicture
            src={`${import.meta.env.BASE_URL}brand/nh-launch.mp4`}
            onPlaying={() => setPlaying(true)}
            onTimeUpdate={event => {
              const time = event.currentTarget.currentTime;
              if (time > progress.current.time) progress.current = { time, at: performance.now() };
            }}
            onEnded={() => reveal('ended')} onError={() => fallback('media-error')}/>
          {failed && <img className="launch-fallback" src={`${import.meta.env.BASE_URL}brand/nh-logo.svg`} alt=""/>}
        </div>
        <div className="launch-wordmark"><strong>乡序</strong><span>从容去，安心回</span></div>
      </div>
    </section>}
  </>;
}
