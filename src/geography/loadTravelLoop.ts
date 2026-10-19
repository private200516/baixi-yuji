import { mapVillages } from '../data/villages.ts';
import { hasClosedTravelLoop } from './travelLoop.ts';
import type { TravelLoop } from './travelLoop.ts';

/** Only a structurally checked local export can supply map geometry and visible claims. */
export function readTravelLoop(value: unknown): TravelLoop {
  const data = value as TravelLoop | null;
  const ids = new Set(mapVillages.map(village => village.id));
  const text = (item: unknown): item is string => typeof item === 'string' && item.length > 0 && item.length < 5000;
  const strings = (item: unknown): item is string[] => Array.isArray(item) && item.every(text);
  const point = (item: unknown): boolean => Array.isArray(item) && item.length === 2 && item.every(Number.isFinite) && Math.abs(item[0]) <= 180 && Math.abs(item[1]) <= 90;
  if (!data || !text(data.id) || !text(data.version) || data.status !== 'research-not-operating' || data.durationSeconds !== null || data.coordinateSystem !== 'EPSG:4326'
    || !strings(data.orderedVillageIds) || data.orderedVillageIds.length < 2 || !data.orderedVillageIds.every(id => ids.has(id)) || new Set(data.orderedVillageIds).size !== data.orderedVillageIds.length
    || !strings(data.orderedSegmentIds) || !strings(data.unresolvedIssues) || !text(data.checkedAt) || !text(data.attribution) || data.attributionUrl !== 'https://www.openstreetmap.org/copyright'
    || !Array.isArray(data.segments) || !data.segments.every(segment => segment && ids.has(segment.fromVillageId) && ids.has(segment.toVillageId)
      && text(segment.id) && Array.isArray(segment.coordinates) && segment.coordinates.length >= 2 && segment.coordinates.every(point)
      && Array.isArray(segment.nodeIds) && segment.nodeIds.length === segment.coordinates.length && segment.nodeIds.every(id => Number.isSafeInteger(id) && id > 0)
      && Array.isArray(segment.edgeWayIds) && segment.edgeWayIds.length === segment.nodeIds.length - 1 && segment.edgeWayIds.every(id => Number.isSafeInteger(id) && id > 0)
      && segment.startNodeId === segment.nodeIds[0] && segment.endNodeId === segment.nodeIds.at(-1))) throw new Error('旅行环线资料结构无效');
  if (data.closureStatus === 'blocked' && data.geometryStatus === 'incomplete' && data.geometry === null && data.distanceMeters === null) return data;
  if (!data.geometry || data.geometry.type !== 'LineString' || !Array.isArray(data.geometry.coordinates) || !data.geometry.coordinates.every(point)
    || data.audit?.topologyVerified !== true || data.audit?.coordinateContinuityVerified !== true || !hasClosedTravelLoop(data)
    || !Number.isFinite(data.distanceMeters) || data.distanceMeters! <= 0) throw new Error('旅行环线尚无有效闭合依据');
  return data;
}
