import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Glyph } from './TransitArt';

export function SheetPanel({ open, title, children, onClose, reducedMotion }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void; reducedMotion: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const content = useRef({ title, children });
  // Preserve the last sheet's content during its exit, including the focus trap.
  if (open) content.current = { title, children };
  useLayoutEffect(() => {
    const element = ref.current!;
    let disposed = false, animation: Animation | undefined;
    const finish = () => {
      if (disposed) return;
      element.close(); element.inert = false;
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    };
    if (open) {
      element.inert = false; element.removeAttribute('data-closing');
      if (!element.open) {
        trigger.current = document.activeElement as HTMLElement;
        element.showModal();
        if (!reducedMotion && element.animate) animation = element.animate(
          [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 340, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    } else if (element.open) {
      element.dataset.closing = 'true';
      element.inert = true;
      if (reducedMotion || !element.animate) finish();
      else {
        animation = element.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(12px)' }],
          { duration: 170, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
        void animation.finished.then(finish, () => {});
      }
    }
    return () => { disposed = true; animation?.cancel(); };
  }, [open, reducedMotion]);
  useLayoutEffect(() => () => ref.current?.close(), []);

  return <dialog ref={ref} className="sheet-panel motion-sheet" onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }} aria-labelledby="sheet-title">
    <div className="sheet-handle" aria-hidden="true"/>
    <div className="sheet-top"><div><span className="mini-eyebrow">乡序 / 服务</span><h2 id="sheet-title">{content.current.title}</h2></div>
      <button className="sheet-close" onClick={onClose} aria-label="关闭弹窗" autoFocus><Glyph name="close"/><span>关闭</span></button>
    </div>
    {content.current.children}
  </dialog>;
}
