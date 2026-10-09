import { mapVillages } from '../data/villages.ts';
import type { ResearchRoute, RoadSuggestion, RouteResearch } from '../geography/routeTypes.ts';

export type JourneyDirection = 'outbound' | 'return';
export type JourneyState = {
  mode: 'demo' | 'research';
  selectedVillageId: string;
  originVillageId: string | null;
  destinationVillageId: string | null;
  routeProposalId: string | null;
  direction: JourneyDirection;
};
export type SavedRouteStatus = 'source-road-geometry' | 'unavailable' | 'data-unavailable';
export type SavedJourney = JourneyState & {
  mode: 'research'; originVillageId: string; destinationVillageId: string;
  schemaVersion: 1; kind: 'research-plan'; dataVersion: string | null; savedAt: string;
  routeStatus: SavedRouteStatus; operatingStatus: 'research-not-confirmed';
};
export type LegacyDemoReturn = { kind: 'demo-return'; time: '17:30' | '18:00' | '18:30' };
export type JourneyStorage = { journey: JourneyState; savedPlan: SavedJourney | null; legacyDemoReturn: LegacyDemoReturn | null };
export const JOURNEY_STORAGE_KEY = 'xiangxu.journey.v1';

const villageIds = new Set(mapVillages.map(village => village.id));
const defaultVillage = mapVillages[0].id;
const demoTimes = new Set(['17:30', '18:00', '18:30']);
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, max = 2048): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001F]/.test(value);
}
function village(value: unknown): value is string { return typeof value === 'string' && villageIds.has(value); }
function nullableVillage(value: unknown): value is string | null { return value === null || village(value); }
function direction(value: unknown): value is JourneyDirection { return value === 'outbound' || value === 'return'; }
function routeId(value: unknown): value is string { return text(value, 200) && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value); }
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function positiveId(value: unknown): value is number { return integer(value) && value > 0; }
function position(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'number' && Number.isFinite(v))
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90 && (value[0] !== 0 || value[1] !== 0);
}
function samePosition(a: [number, number], b: [number, number]) { return a[0] === b[0] && a[1] === b[1]; }
function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  return !!match && calendarDate(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60 && Number(match[4]) < 60 && Number.isFinite(Date.parse(value));
}
function assertData(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('道路研究资料无效：' + message);
}

/** Validate fetched data before it can become a route, a marker, or a saved plan. */
export function validateRouteResearch(value: unknown): RouteResearch {
  const data = record(value);
  assertData(data && text(data.version, 200) && calendarDate(data.checkedAt), '缺少版本或核验日期');
  assertData(data.license === 'ODbL-1.0' && text(data.attribution) && typeof data.attributionUrl === 'string' && /^https:\/\/www\.openstreetmap\.org\/copyright\/?$/.test(data.attributionUrl), '缺少有效来源署名');
  assertData(text(data.method) && data.mainlineStatus === 'research-order-only-not-an-operating-line' && integer(data.excludedWays), '研究状态无效');
  assertData(Array.isArray(data.mainlineCandidate) && data.mainlineCandidate.every(village) && new Set(data.mainlineCandidate).size === data.mainlineCandidate.length, '研究村落顺序无效');
  assertData(Array.isArray(data.suggestions) && Array.isArray(data.routes), '缺少研究点或路段');
  const coverage = record(data.coverage);
  assertData(coverage && ['nodeCount','wayCount','directedEdgeCount','successfulRoutes','requestedRoutes'].every(key => integer(coverage[key])) && text(coverage.limitation), '覆盖范围说明无效');
  assertData((coverage.successfulRoutes as number) <= (coverage.requestedRoutes as number), '覆盖数量无效');
  const suggestions = new Map<string, RoadSuggestion>();
  const suggestionVillages = new Set<string>();
  for (const candidate of data.suggestions as unknown[]) {
    const point = record(candidate);
    assertData(point && routeId(point.id) && village(point.villageId), '参考点标识无效');
    assertData(!suggestions.has(point.id) && !suggestionVillages.has(point.villageId), '重复参考点');
    assertData(point.accessConnectionStatus === 'unknown' && text(point.note), '参考点不能被升级为已核验车站');
    assertData(point.straightLineOffsetMeters === null || integer(point.straightLineOffsetMeters), '参考点偏移无效');
    if (point.status === 'suggested-unverified') {
      assertData(positiveId(point.nodeId) && position(point.coordinates), '参考点缺少合法坐标');
    } else {
      assertData(point.status === 'unavailable' && point.nodeId === null && point.coordinates === null, '缺失参考点不能使用替代坐标');
    }
    suggestions.set(point.id, candidate as RoadSuggestion);
    suggestionVillages.add(point.villageId);
  }
  const routeIds = new Set<string>(), orderedPairs = new Set<string>();
  for (const candidate of data.routes as unknown[]) {
    const route = record(candidate);
    assertData(route && routeId(route.id) && village(route.fromVillageId) && village(route.toVillageId) && route.fromVillageId !== route.toVillageId, '路段起终点无效');
    const pair = route.fromVillageId + '>' + route.toVillageId;
    assertData(!routeIds.has(route.id) && !orderedPairs.has(pair), '重复方向路段');
    routeIds.add(route.id); orderedPairs.add(pair);
    assertData(routeId(route.fromSuggestionId) && routeId(route.toSuggestionId), '参考点关系无效');
    const from = suggestions.get(route.fromSuggestionId), to = suggestions.get(route.toSuggestionId);
    assertData(from && to && from.villageId === route.fromVillageId && to.villageId === route.toVillageId, '参考点与古村不对应');
    assertData(route.profile === 'directed-road-connectivity-research' && route.operatingStatus === 'research-not-confirmed' && route.estimatedDurationSeconds === null, '不得混入运营或到站预测');
    assertData(text(route.source) && timestamp(route.retrievedAt) && text(route.riskNote), '路段来源或风险说明缺失');
    assertData(Array.isArray(route.nodeIds) && route.nodeIds.every(positiveId) && Array.isArray(route.wayIds) && route.wayIds.every(positiveId), '路段证据无效');
    if (route.geometryStatus === 'source-road-geometry') {
      assertData(Array.isArray(route.coordinates) && route.coordinates.length >= 2 && route.coordinates.every(position), '沿路几何无效');
      assertData(route.nodeIds.length === route.coordinates.length && route.wayIds.length > 0, '几何与原始节点证据不符');
      assertData(from.status === 'suggested-unverified' && to.status === 'suggested-unverified' && from.coordinates && to.coordinates, '缺失参考点不能生成路线');
      assertData(samePosition(route.coordinates[0], from.coordinates) && samePosition(route.coordinates[route.coordinates.length - 1], to.coordinates), '路线端点不在研究参考点');
      assertData(route.nodeIds[0] === from.nodeId && route.nodeIds[route.nodeIds.length - 1] === to.nodeId, '路线端点节点不符');
      assertData(route.distanceMeters === null || (typeof route.distanceMeters === 'number' && Number.isFinite(route.distanceMeters) && route.distanceMeters >= 0), '距离无效');
      assertData(route.unavailableReason === null, '可用路段状态冲突');
    } else {
      assertData(route.geometryStatus === 'unavailable' && route.coordinates === null && route.distanceMeters === null && route.nodeIds.length === 0 && route.wayIds.length === 0 && text(route.unavailableReason), '无路径状态不能保留假几何或距离');
    }
  }
  return value as RouteResearch;
}

export function createJourney(selectedVillageId = defaultVillage): JourneyState {
  return { mode:'demo', selectedVillageId:village(selectedVillageId) ? selectedVillageId : defaultVillage, originVillageId:null, destinationVillageId:null, routeProposalId:null, direction:'outbound' };
}
export function selectJourneyVillage(state: JourneyState, id: string): JourneyState {
  if (!village(id) || state.selectedVillageId === id) return state;
  return { ...state, selectedVillageId:id, originVillageId:state.mode === 'research' ? id : null, destinationVillageId:null, routeProposalId:null, direction:'outbound' };
}
export function openResearch(state: JourneyState): JourneyState {
  if (!village(state.selectedVillageId)) return createJourney();
  if (state.mode === 'research' && state.originVillageId === state.selectedVillageId) return state;
  return { ...state, mode:'research', originVillageId:state.selectedVillageId, destinationVillageId:null, routeProposalId:null, direction:'outbound' };
}
export function journeyEndpoints(state: JourneyState): { fromVillageId: string | null; toVillageId: string | null } {
  if (state.mode !== 'research') return { fromVillageId:null, toVillageId:null };
  return state.direction === 'outbound'
    ? { fromVillageId:state.originVillageId, toVillageId:state.destinationVillageId }
    : { fromVillageId:state.destinationVillageId, toVillageId:state.originVillageId };
}
export function findJourneyRoute(state: JourneyState, research?: RouteResearch | null): ResearchRoute | null {
  const { fromVillageId, toVillageId } = journeyEndpoints(state);
  if (!village(fromVillageId) || !village(toVillageId) || fromVillageId === toVillageId || !research) return null;
  return research.routes.find(route => route.fromVillageId === fromVillageId && route.toVillageId === toVillageId) ?? null;
}
export function chooseJourneyDestination(state: JourneyState, toId: string, research?: RouteResearch | null): JourneyState {
  const base = state.mode === 'research' ? state : openResearch(state);
  if (!village(toId) || !village(base.originVillageId) || toId === base.originVillageId) return state;
  const next: JourneyState = { ...base, destinationVillageId:toId, routeProposalId:null, direction:'outbound' };
  return { ...next, routeProposalId:findJourneyRoute(next, research)?.id ?? null };
}
export function setJourneyDirection(state: JourneyState, nextDirection: JourneyDirection, research?: RouteResearch | null): JourneyState {
  if (state.mode !== 'research' || !direction(nextDirection)) return state;
  const next = { ...state, direction:nextDirection, routeProposalId:null };
  return { ...next, routeProposalId:findJourneyRoute(next, research)?.id ?? null };
}
/** Offline/no-path plans are valid intentions, never claims of a working route. */
export function createSavedJourney(state: JourneyState, research: RouteResearch | null | undefined, savedAt: string): SavedJourney | null {
  if (state.mode !== 'research' || !village(state.selectedVillageId) || !village(state.originVillageId) || !village(state.destinationVillageId) || state.originVillageId === state.destinationVillageId || !direction(state.direction) || !timestamp(savedAt)) return null;
  const route = findJourneyRoute(state, research);
  return {
    ...state, mode:'research', originVillageId:state.originVillageId, destinationVillageId:state.destinationVillageId,
    routeProposalId:route?.id ?? null, schemaVersion:1, kind:'research-plan', dataVersion:research?.version ?? null, savedAt,
    routeStatus:!research ? 'data-unavailable' : route?.geometryStatus === 'source-road-geometry' ? 'source-road-geometry' : 'unavailable',
    operatingStatus:'research-not-confirmed',
  };
}

function parseJourney(value: unknown): JourneyState | null {
  const item = record(value);
  if (!item || (item.mode !== 'demo' && item.mode !== 'research') || !village(item.selectedVillageId) || !nullableVillage(item.originVillageId) || !nullableVillage(item.destinationVillageId) || (item.routeProposalId !== null && !routeId(item.routeProposalId)) || !direction(item.direction)) return null;
  if (item.originVillageId !== null && item.originVillageId === item.destinationVillageId) return null;
  if (item.mode === 'demo' && (item.originVillageId !== null || item.destinationVillageId !== null || item.routeProposalId !== null || item.direction !== 'outbound')) return null;
  if (item.mode === 'research' && item.originVillageId === null) return null;
  if (item.destinationVillageId === null && item.routeProposalId !== null) return null;
  return { mode:item.mode, selectedVillageId:item.selectedVillageId, originVillageId:item.originVillageId, destinationVillageId:item.destinationVillageId, routeProposalId:item.routeProposalId, direction:item.direction };
}
function parseSaved(value: unknown): SavedJourney | null {
  const item = record(value), journey = parseJourney(value);
  if (!item || !journey || journey.mode !== 'research' || !village(journey.originVillageId) || !village(journey.destinationVillageId) || item.schemaVersion !== 1 || item.kind !== 'research-plan' || item.operatingStatus !== 'research-not-confirmed' || !timestamp(item.savedAt) || (item.dataVersion !== null && !text(item.dataVersion,200))) return null;
  if (!['source-road-geometry','unavailable','data-unavailable'].includes(item.routeStatus as string)) return null;
  if (item.routeStatus === 'source-road-geometry' && (journey.routeProposalId === null || item.dataVersion === null)) return null;
  if (item.routeStatus === 'unavailable' && item.dataVersion === null) return null;
  if (item.routeStatus === 'data-unavailable' && journey.routeProposalId !== null) return null;
  return { ...journey, mode:'research', originVillageId:journey.originVillageId, destinationVillageId:journey.destinationVillageId, schemaVersion:1, kind:'research-plan', dataVersion:item.dataVersion as string | null, savedAt:item.savedAt, routeStatus:item.routeStatus as SavedRouteStatus, operatingStatus:'research-not-confirmed' };
}
function parseDemoReturn(value: unknown): LegacyDemoReturn | null {
  const item = record(value);
  return item?.kind === 'demo-return' && typeof item.time === 'string' && demoTimes.has(item.time) ? { kind:'demo-return', time:item.time as LegacyDemoReturn['time'] } : null;
}
function parseRaw(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function migrateLegacyPlan(value: unknown): SavedJourney | null {
  const item = record(value);
  if (!item || !village(item.from) || !village(item.to) || item.from === item.to || !direction(item.direction) || !text(item.dataVersion,200) || !timestamp(item.savedAt) || item.operatingStatus !== 'research-not-confirmed') return null;
  // The legacy record did not store route ID or geometry status. Preserve its
  // version/date without pretending that today's dataset has already revalidated it.
  return { mode:'research', selectedVillageId:item.from, originVillageId:item.from, destinationVillageId:item.to, routeProposalId:null, direction:item.direction, schemaVersion:1, kind:'research-plan', dataVersion:item.dataVersion, savedAt:item.savedAt, routeStatus:'data-unavailable', operatingStatus:'research-not-confirmed' };
}
export function readJourneyStorage(raw: string | null, legacyPrefsRaw: string | null, legacyPlanRaw?: string | null): JourneyStorage {
  const stored = record(parseRaw(raw)), prefs = record(parseRaw(legacyPrefsRaw));
  const hasCurrentStorage = stored?.schemaVersion === 1 && stored.kind === 'journey-storage';
  const savedPlan = hasCurrentStorage ? parseSaved(stored.savedPlan) : migrateLegacyPlan(parseRaw(legacyPlanRaw));
  const savedState = savedPlan ? parseJourney(savedPlan) : null;
  const journey = (hasCurrentStorage ? parseJourney(stored.journey) : null) ?? savedState ?? createJourney();
  const prefsHasDemo = !!prefs && Object.prototype.hasOwnProperty.call(prefs, 'savedReturn');
  const legacyDemoReturn = prefsHasDemo
    ? parseDemoReturn({ kind:'demo-return', time:prefs!.savedReturn })
    : hasCurrentStorage ? parseDemoReturn(stored.legacyDemoReturn) : null;
  return { journey, savedPlan, legacyDemoReturn };
}
export function serializeJourneyStorage(journey: JourneyState, savedPlan: SavedJourney | null, legacyDemoReturn: LegacyDemoReturn | null): string {
  // Only whitelisted journey fields are persisted. Existing preferences are never written.
  return JSON.stringify({ schemaVersion:1, kind:'journey-storage', journey:parseJourney(journey) ?? createJourney(), savedPlan:parseSaved(savedPlan), legacyDemoReturn:parseDemoReturn(legacyDemoReturn) });
}
