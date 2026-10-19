import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Glyph } from './TransitArt';

export function SheetPanel({ open, title, children, onClose, reducedMotion, unmountOnClose = false, trapFocus = false, fallbackFocus }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void; reducedMotion: boolean; unmountOnClose?: boolean; trapFocus?: boolean; fallbackFocus?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [, refreshContent] = useState(0);
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
      if (unmountOnClose) { content.current = { ...content.current, children: null }; refreshContent(value => value + 1); }
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
      if (document.activeElement !== trigger.current) fallbackFocus?.()?.focus({ preventScroll: true });
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
  }, [open, reducedMotion, unmountOnClose]);
  // Replacing a list with a detail inside the same modal removes its focused row.
  // Keep focus in the dialog without resetting it during ordinary form updates.
  useLayoutEffect(() => {
    const element = ref.current;
    if (open && element?.open && !element.contains(document.activeElement)) element.querySelector<HTMLButtonElement>('.sheet-close')?.focus({ preventScroll: true });
  }, [open, title, children]);
  useLayoutEffect(() => () => ref.current?.close(), []);

  return <dialog ref={ref} className="sheet-panel motion-sheet" onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (!trapFocus || event.key !== 'Tab') return;
      const targets = [...event.currentTarget.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,summary,[tabindex]')]
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = targets[0], last = targets.at(-1), active = document.activeElement;
      if (!first || !last) { event.preventDefault(); return; }
      if (!event.currentTarget.contains(active) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }} aria-labelledby={titleId}>
    <div className="sheet-handle" aria-hidden="true"/>
    <div className="sheet-top"><div><span className="mini-eyebrow">乡序 / 服务</span><h2 id={titleId}>{content.current.title}</h2></div>
      <button className="sheet-close" onClick={onClose} aria-label="关闭弹窗" autoFocus><Glyph name="close"/><span>关闭</span></button>
    </div>
    {content.current.children}
  </dialog>;
}
