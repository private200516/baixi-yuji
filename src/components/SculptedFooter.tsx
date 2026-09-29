import { Icon } from './Icon';

export function SculptedFooter() {
  return <div className="curve-foot">
    <svg className="curve-tail" viewBox="0 0 1000 320" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0H1000V22C1000 72 960 100 894 100H680C607 100 545 130 545 179C545 218 582 242 638 242V247C638 285 599 300 550 300H325C274 300 263 319 219 319C155 319 106 289 106 224V198C106 148 105 132 62 116C20 100 0 97 0 45Z"/></svg>
    <span className="curve-caption" aria-hidden="true">沿溪而行 · 从容抵达</span>
    <div className="notch"><a className="return-link" href="#/return"><Icon name="return"/>查看返程<Icon name="arrow"/></a></div>
  </div>;
}
