import { useState } from 'react';
import { pages } from '../data/demo';
import type { Page } from '../data/demo';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

export function Navigation({ page }: { page: Page }) {
  const [open, setOpen] = useState(false);
  const links = <nav aria-label="主导航">{pages.map(item =>
    <a key={item.id} href={`#/${item.id}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => setOpen(false)}>
      <Icon name={item.id}/><span>{item.label}</span>{page === item.id && <span className="nav-dot" aria-hidden="true"/>}
    </a>,
  )}</nav>;
  return <>
    <aside className="right-rail"><div className="rail-sticky"><span className="rail-label" aria-hidden="true">一路相伴</span>{links}<span className="rail-line" aria-hidden="true"/></div></aside>
    <div className="compact-nav"><button className="nav-toggle" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu"/>导航</button></div>
    {open && <Dialog title="导航" onClose={() => setOpen(false)} panel>{links}</Dialog>}
  </>;
}
