import { mapVillages } from '../data/villages';
import type { ResearchRoute, RouteResearch } from '../geography/routeTypes';
import { findJourneyRoute, journeyEndpoints } from './journey';
import type { JourneyState } from './journey';
import { Glyph } from './TransitArt';

export const villageName = (id: string | null) => mapVillages.find(village => village.id === id)?.displayName || '待选古村';
export const roadDistance = (route: ResearchRoute | null) => route?.geometryStatus === 'source-road-geometry' ? route.distanceMeters !== null ? `${(route.distanceMeters / 1000).toFixed(1)} km` : '距离待核验' : '暂无路径';

export function ResearchRoutePanel({ journey, research, status, versionChanged, onDestination, onDirection }: {
  journey: JourneyState; research: RouteResearch | null; status: string; versionChanged: boolean;
  onDestination: (id: string) => void; onDirection: () => void;
}) {
  const endpoints = journeyEndpoints(journey), current = findJourneyRoute(journey, research);
  const candidates = mapVillages.filter(village => village.id !== journey.originVillageId);
  const distanceLabel = (route: ResearchRoute | null) => status === 'loading' ? '资料载入中' : !research ? '资料暂不可用' : roadDistance(route);
  return <>
    <div className="surface-kicker"><span>{journey.direction === 'return' ? '返程起村' : '选择目的村'} · 道路研究</span><button className="surface-icon" onClick={onDirection} aria-label="切换研究方向" disabled={!journey.destinationVillageId}><Glyph name="swap"/></button></div>
    <h3 className="route-title">{villageName(endpoints.fromVillageId)}<Glyph name="arrow"/>{villageName(endpoints.toVillageId)}</h3>
    <div className="route-chips"><span>{journey.destinationVillageId ? distanceLabel(current) : '未选终点'}</span><span>非公交线路</span><span>{versionChanged ? '资料有更新' : '运营待核验'}</span></div>
    <ol className="stop-list detail-stops">{candidates.map(village => {
      const from = journey.direction === 'return' ? village.id : journey.originVillageId;
      const to = journey.direction === 'return' ? journey.originVillageId : village.id;
      const route = research?.routes.find(item => item.fromVillageId === from && item.toVillageId === to) || null;
      const selected = village.id === journey.destinationVillageId;
      return <li key={village.id} className={selected ? 'current' : ''}><i/><button aria-pressed={selected} onClick={() => onDestination(village.id)}><strong>{village.displayName}</strong><small>{distanceLabel(route)} · 非车站</small></button>{selected && <span className="here-label">已选</span>}</li>;
    })}</ol>
    <div className="route-service"><Glyph name="clock"/><span>站点待核验 <i/> 班次待核验</span></div>
    <p className="surface-footnote">{status === 'error' ? '资料不可用，点题签重试；非公交线路。' : '道路样本不代表线路已开通或车辆能通行。'}</p>
  </>;
}

export function ResearchReturnPanel({ journey, research, status, versionChanged }: {
  journey: JourneyState; research: RouteResearch | null; status: string; versionChanged: boolean;
}) {
  const endpoints = journeyEndpoints(journey), route = findJourneyRoute(journey, research);
  const rows = ['返程道路研究', status === 'loading' ? '道路资料载入中' : !research ? '道路资料暂不可用' : `道路 · ${roadDistance(route)}`, '上下客点待核验', '班次时刻待核验', '车辆通行待核验', versionChanged ? '旧计划待复核' : '仅作本地计划'];
  return <>
    <div className="surface-kicker"><span>返程计划 · 非运营班次</span><Glyph name="back"/></div>
    <h3 className="return-title">{villageName(endpoints.fromVillageId)} <span>→</span><br/>{villageName(endpoints.toVillageId)}</h3>
    <ol className="stop-list return-stops">{rows.map((text, index) => <li key={index} className={index === 0 ? 'current' : ''}><i/><span>{text}</span>{index === 0 && <small>非车站</small>}</li>)}</ol>
    <div className="return-slots" role="group" aria-label="研究信息状态">{['非车站', '非班次', '非导航'].map(label => <button key={label} disabled>{label}</button>)}</div>
    <p className="surface-footnote">{!journey.destinationVillageId ? '先选择研究区间，再保存本地计划。' : status === 'error' ? '资料暂不可用，可保存待核验计划。' : '仅保存古村研究计划，不代表已预约车辆。'}</p>
  </>;
}
