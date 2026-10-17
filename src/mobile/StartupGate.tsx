import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './startup.css';

const REVEAL_MS = 640;
const FALLBACK_MS = 4042;
const FIRST_FRAME_MS = 10000;
const STALL_MS = 5000;
const MAX_VISIBLE_MS = 20000;
type Phase = 'intro' | 'fallback' | 'revealing' | 'done';

/** Mount the real app immediately so the last video frame can dissolve into a ready page. */
export function StartupGate({ children, reducedMotion }: { children: ReactNode; reducedMotion: boolean }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const screen = useRef<HTMLElement>(null);
  const app = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackMark = useRef<HTMLImageElement>(null);
  const progress = useRef({ time: 0, at: 0 });
  const restoreFocus = useRef(false);
  const setStage = (next: Phase) => { phaseRef.current = next; setPhase(next); };

  const reveal = useCallback((cause: string) => {
    if (phaseRef.current === 'done' || phaseRef.current === 'revealing') return;
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
  }, []);

  useEffect(() => {
    if (phase !== 'intro') return;
    const media = video.current!;
    let disposed = false;
    let started = performance.now();
    let hiddenAt = document.hidden ? started : 0;
    let requestingPlay = false;
    progress.current = { time: 0, at: started };
    screen.current?.focus({ preventScroll: true });
    // Set both properties and attributes before attaching the media source.
    media.muted = true;
    media.defaultMuted = true;
    media.playsInline = true;
    media.setAttribute('muted', '');
    media.setAttribute('playsinline', '');
    media.setAttribute('webkit-playsinline', '');
    const attemptPlay = () => {
      if (disposed || document.hidden || requestingPlay || phaseRef.current !== 'intro' || !media.paused) return;
      requestingPlay = true;
      const onFailure = (error: DOMException) => {
        if (disposed || document.hidden || phaseRef.current !== 'intro') return;
        // A load/visibility interruption is retryable; browser policy rejection is not.
        if (error.name === 'NotAllowedError') fallback('playback-blocked');
        else if (error.name !== 'AbortError') fallback('media-error');
      };
      try { void Promise.resolve(media.play()).catch(onFailure).finally(() => { requestingPlay = false; }); }
      catch (error) { requestingPlay = false; onFailure(error as DOMException); }
    };
    const onVisibility = () => {
      const now = performance.now();
      if (document.hidden) { hiddenAt = now; media.pause(); }
      else {
        if (hiddenAt) { started += now - hiddenAt; progress.current.at += now - hiddenAt; hiddenAt = 0; }
        attemptPlay();
      }
    };
    media.addEventListener('loadeddata', attemptPlay);
    media.addEventListener('canplay', attemptPlay);
    document.addEventListener('visibilitychange', onVisibility);
    media.src = `${import.meta.env.BASE_URL}brand/nh-launch-mobile.mp4`;
    media.load();
    attemptPlay();
    const watchdog = setInterval(() => {
      if (document.hidden) return;
      const now = performance.now();
      if (media.currentTime > progress.current.time) progress.current = { time: media.currentTime, at: now };
      const limit = progress.current.time > 0 ? STALL_MS : FIRST_FRAME_MS;
      if (now - progress.current.at > limit || now - started > MAX_VISIBLE_MS) fallback('media-timeout');
      else if (media.paused && !media.ended) attemptPlay();
    }, 250);
    return () => {
      disposed = true; clearInterval(watchdog);
      media.removeEventListener('loadeddata', attemptPlay);
      media.removeEventListener('canplay', attemptPlay);
      document.removeEventListener('visibilitychange', onVisibility);
      media.pause();
    };
  }, [phase, fallback]);

  useEffect(() => {
    if (phase !== 'fallback') return;
    // A native brand animation also works when a mobile browser refuses video autoplay.
    const animation = fallbackMark.current?.animate?.([
      { clipPath: 'inset(0 100% 0 0)', opacity: .25, transform: 'scale(.96)', offset: 0 },
      { clipPath: 'inset(0 0 0 0)', opacity: 1, transform: 'scale(1)', offset: .72 },
      { clipPath: 'inset(0 0 0 0)', opacity: 1, transform: 'scale(1)', offset: 1 },
    ], { duration: FALLBACK_MS, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
    let elapsed = 0, last = performance.now();
    const onVisibility = () => {
      last = performance.now();
      if (document.hidden) animation?.pause(); else animation?.play();
    };
    if (document.hidden) animation?.pause();
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(() => {
      const now = performance.now();
      if (!document.hidden) elapsed += now - last;
      last = now;
      if (elapsed >= FALLBACK_MS) reveal(reason);
    }, 50);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); animation?.cancel(); };
  }, [phase, reason, reveal]);

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
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, []);

  const active = phase !== 'done';
  return <>
    <div ref={app} className="launch-app" data-launch={phase} data-launch-reason={reason || undefined}
      inert={active} aria-hidden={active || undefined}>{children}</div>
    {active && <section ref={screen} tabIndex={-1} className="launch-screen" data-phase={phase} data-failed={failed} role="dialog" aria-modal="true" aria-label="宁海公交启动动画"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
        if (event.key === 'Tab') { event.preventDefault(); screen.current?.focus({ preventScroll: true }); }
      }}>
      <div className="launch-composition">
        <div className="launch-media" aria-hidden="true">
          <video ref={video} className="launch-video" autoPlay muted playsInline preload="auto" disablePictureInPicture
            poster={`${import.meta.env.BASE_URL}brand/nh-launch-poster.svg`}
            onPlaying={event => { if (document.hidden || phaseRef.current !== 'intro') event.currentTarget.pause(); }}
            onTimeUpdate={event => {
              if (document.hidden || phaseRef.current !== 'intro') return;
              const time = event.currentTarget.currentTime;
              if (time > progress.current.time) progress.current = { time, at: performance.now() };
            }}
            onEnded={() => { if (phaseRef.current === 'intro') reveal('ended'); }} onError={() => fallback('media-error')}/>
          {failed && <div className="launch-fallback">
            <img className="launch-fallback-ghost" src={`${import.meta.env.BASE_URL}brand/nh-logo.svg`} alt=""/>
            <img ref={fallbackMark} className="launch-fallback-mark" src={`${import.meta.env.BASE_URL}brand/nh-logo.svg`} alt=""/>
          </div>}
        </div>
        <div className="launch-wordmark"><strong>宁海公交</strong><span>从容去，安心回</span></div>
      </div>
    </section>}
  </>;
}
