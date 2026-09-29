import type { DemoJourney } from '../data/demo';

// A decorative field of dots; it carries no geographical or transport information.
const dots = Array.from({ length: 12 }, (_, row) => Array.from({ length: 36 }, (_, col) => ({ row, col }))).flat()
  .filter(({ row, col }) => row > 4 - Math.sin(col / 4) * 3 && row < 11 - Math.cos(col / 5) * 1.4);

export function ReturnSummary({ journey }: { journey: DemoJourney }) {
  return <div className="lower-composition">
    <div className="heritage-signature" aria-hidden="true"><span className="signature-cn">白溪舆记</span><span className="signature-en">BAIXI YUJI</span><img src="./brand/logo-mono.svg" alt="" width="72" height="72"/></div>
    <section className="return-surface" aria-labelledby="return-heading">
      <svg className="return-backdrop" viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true"><path d="M80 0H850Q1000 0 1000 110V400Q1000 520 850 520H250C150 520 145 450 135 406C125 362 96 346 58 329C20 312 0 282 0 224V80Q0 0 80 0Z"/></svg>
      <div className="return-copy"><p className="eyebrow">去有方向，回有着落</p><h2 id="return-heading">也把回程，放在心上。</h2><p>还没有保存返程卡。<br className="mobile-break"/>先看看回程安排。</p></div>
      <div className="return-summary"><div><span className="summary-label">关联回程 · 演示</span><strong>{journey.relatedReturn.departure}<small>发车</small></strong></div><p>从 {journey.relatedReturn.from}<br/><span>开往 {journey.relatedReturn.destination}</span></p></div>
      <svg className="landscape-dots" viewBox="0 0 540 176" aria-hidden="true">{dots.map(({ row, col }) => <circle key={`${row}-${col}`} cx={8 + col * 15} cy={8 + row * 14} r="4" fill={(row * 7 + col * 3) % 11 < 3 ? '#5D7877' : '#F4F0E6'}/>)}</svg>
    </section>
  </div>;
}
