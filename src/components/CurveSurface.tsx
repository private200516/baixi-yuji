import type { ReactNode } from 'react';

// The background alone stretches; content remains in ordinary document flow.
export function CurveSurface({ children, sculpted = false }: { children: ReactNode; sculpted?: boolean }) {
  return <section className={`curve-surface${sculpted ? ' sculpted' : ''}`} aria-label="当前乘车方案">
    <svg className="curve-cap" viewBox="0 0 1000 110" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 110V88C0 36 48 0 120 0H310C420 0 408 78 566 78H854C934 78 1000 90 1000 110Z"/>
    </svg>
    <div className="curve-body" aria-hidden="true"/>
    {children}
  </section>;
}
