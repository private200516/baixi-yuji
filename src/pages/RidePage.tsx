import { DEMO } from '../data/demo';
import type { DemoJourney, Direction } from '../data/demo';
import { CurveSurface } from '../components/CurveSurface';
import { SculptedFooter } from '../components/SculptedFooter';
import { ReturnSummary } from '../components/ReturnSummary';
import { Icon } from '../components/Icon';

interface Props {
  journey: DemoJourney; favorite: boolean;
  onDirection: (direction: Direction) => void;
  onFavorite: () => void; onStation: () => void; onPlanner: () => void;
}

export function RidePage({ journey, favorite, onDirection, onFavorite, onStation, onPlanner }: Props) {
  return <>
    <CurveSurface sculpted>
      <div className="surface-heading">
        <div className="direction-switch" data-direction={journey.id} role="group" aria-label="乘车方向">
          <button aria-pressed={journey.id === 'outbound'} onClick={() => onDirection('outbound')}>去古镇</button>
          <button aria-pressed={journey.id === 'inbound'} onClick={() => onDirection('inbound')}>回城区</button>
        </div>
      </div>
      <div className="ride-canvas">
        <section className="station-sheet" aria-label="上车站点">
          <p className="eyebrow">山水之间 · 好好出发</p>
          <h1>下一站，<span>{journey.destination}。</span></h1>
          <div className="station-label"><Icon name="pin"/><span>在这里上车</span></div>
          <div key={journey.id} className="changing-station"><h2>{journey.stops[0].name}</h2><p className="destination-line">开往 <strong>{journey.destination}</strong><Icon name="arrow"/></p></div>
        </section>
        <section className="journey-connection" aria-label="演示行程说明">
          <span className="connection-number" aria-hidden="true">一程山水</span><p>{journey.id === 'outbound' ? '从城区，到古镇。' : '从古镇，回城区。'}<br/>每一程，都从容。</p>
          <svg className="stream-drawing" viewBox="0 0 360 90" fill="none" aria-hidden="true"><path className="stream-base" d="M8 64H66C116 64 111 12 165 12H218C276 12 260 64 312 64H350"/><path className="stream-path" d="M8 64H66C116 64 111 12 165 12H218C276 12 260 64 312 64H350" pathLength="1"/><circle cx="8" cy="64" r="5"/><circle cx="350" cy="64" r="5"/></svg>
          <p className="connection-caption">行程示意 · 站点待核实</p>
        </section>
        <button className="primary-button station-button" onClick={onStation}><Icon name="pin"/>去上车点<Icon name="arrow"/></button>
        <section className="desktop-planner" aria-label="行前计划初稿">
          <div className="planner-title"><span>行前计划</span><span className="small-pill">初稿</span></div>
          <div className="planner-fields"><div><label htmlFor="departure">出发点</label><output id="departure">{journey.stops[0].name}</output></div><div><label htmlFor="destination">目的地</label><select id="destination" value={journey.id} onChange={event => onDirection(event.target.value as Direction)}><option value="outbound">前童古镇</option><option value="inbound">宁海城区</option></select></div></div>
          <button className="outline-button planner-button" onClick={onPlanner}>查询方案 <span className="button-note">待开发</span><Icon name="arrow"/></button>
        </section>
        <div className="journey-extras">
          <details className="route-outline"><summary>查看上下车点</summary><p>行程示意 · 非正式站序</p><ol>{journey.stops.map((stop, index) => <li key={stop.id}><span className="stop-node" aria-hidden="true"/><span><small>{index === 0 ? '上车' : '下车'}</small>{stop.name}</span></li>)}</ol></details>
          <button className="favorite-button" aria-pressed={favorite} onClick={onFavorite}><Icon name={favorite ? 'check' : 'star'}/>{favorite ? '已收藏 · 取消' : '收藏此线路'}</button>
          <p className="local-hint">手动选站 · 未使用定位</p>
        </div>
      </div>
      <SculptedFooter/>
    </CurveSurface>
    <ReturnSummary journey={journey}/>
    <p className="data-note"><Icon name="help"/><span>{DEMO.notice}<br/>演示时钟 {DEMO.clock} · 数据更新于 {DEMO.updatedAt}</span></p>
  </>;
}
