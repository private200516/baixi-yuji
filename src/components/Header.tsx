import { DEMO } from '../data/demo';
import type { DemoJourney, FontSize } from '../data/demo';
import { Icon } from './Icon';

export function Header({ journey, fontSize, setFontSize, onListen }: { journey: DemoJourney; fontSize: FontSize; setFontSize: (size: FontSize) => void; onListen: () => void }) {
  return <header className="site-header">
    <div className="hero-departure"><p>下一班计划<span className="hero-demo">演示数据</span></p><div className="departure-time" key={journey.id}><time>{journey.departure}</time><span>发车</span></div><p className="hero-date">{DEMO.dateLabel} · 非实时预测</p></div>
    <div className="hero-identity">
    <a className="brand" href="#/ride" aria-label="白溪舆记，乘车首页">
      <img src="./brand/logo-mono.svg" width="48" height="48" alt=""/>
      <span><strong>白溪舆记</strong><span className="brand-en">BAIXI YUJI</span></span>
    </a>
    </div>
    <div className="header-tools">
      <div className="font-switch" role="group" aria-label="显示字号">
        <button aria-pressed={fontSize === 'standard'} onClick={() => setFontSize('standard')}>标准</button>
        <button aria-pressed={fontSize === 'large'} onClick={() => setFontSize('large')}>大字</button>
      </div>
      <button className="listen-button" onClick={onListen}><Icon name="speaker"/>听一遍</button>
    </div>
  </header>;
}
