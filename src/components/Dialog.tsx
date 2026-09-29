import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Dialog({ title, children, onClose, panel = false }: { title: string; children: ReactNode; onClose: () => void; panel?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); trigger?.focus(); };
  }, []);
  return <dialog ref={ref} className={panel ? 'dialog nav-panel' : 'dialog'} aria-labelledby="dialog-title" onCancel={onClose} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const elements = Array.from(ref.current!.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"]'));
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className="dialog-top"><h2 id="dialog-title">{title}</h2><button className="outline-button" onClick={onClose} autoFocus><Icon name="close"/>关闭</button></div>
    {children}
  </dialog>;
}
