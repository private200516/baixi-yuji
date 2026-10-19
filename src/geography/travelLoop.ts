import type { RoadSuggestion } from './routeTypes';

export type TravelLoopCoordinate = [number, number];
export type TravelLoopSegment = {
  id: string;
  fromVillageId: string;
  toVillageId: string;
  fromReferencePointId: string;
  toReferencePointId: string;
  startNodeId: number;
  endNodeId: number;
  nodeIds: number[];
  edgeWayIds: number[];
  coordinates: TravelLoopCoordinate[];
  distanceMeters: number;
  durationSeconds: null;
  sourceRefs: string[];
};
export type TravelLoop = {
  id: string;
  version: string;
  name: string;
  status: 'research-not-operating';
  orderedVillageIds: string[];
  orderedSegmentIds: string[];
  referencePointIds: string[];
  referencePoints: RoadSuggestion[];
  segments: TravelLoopSegment[];
  geometry: { type: 'LineString'; coordinates: TravelLoopCoordinate[] } | null;
  geometryStatus: 'source-road-geometry' | 'incomplete';
  closureStatus: 'closed-directed-road-cycle' | 'blocked';
  direction: 'ordered-directed';
  directionLabel: string;
  distanceMeters: number | null;
  durationSeconds: null;
  coordinateSystem: 'EPSG:4326';
  coordinateTransformation: 'none';
  sourceRefs: string[];
  checkedAt: string;
  unresolvedIssues: string[];
  attribution: string;
  attributionUrl: string;
  license: 'ODbL-1.0';
  audit: {
    candidateCount: number;
    directedEdgeCount: number;
    uniquePhysicalEdgeCount: number;
    extraRepeatedDistanceMeters: number;
    extraRepeatedDistanceRatio: number;
    reverseTraversedPhysicalEdgeCount: number;
    immediateReversalNodeIds: number[];
    projectedCrossingCount: number;
    repeatedNodeCount: number;
    topologyVerified: boolean;
    coordinateContinuityVerified: boolean;
    selectionMethod: string;
  };
};

/** Defend the map against partial exports; never draw an invented closing edge. */
export function hasClosedTravelLoop(loop: TravelLoop | null | undefined): loop is TravelLoop & { geometry: NonNullable<TravelLoop['geometry']> } {
  if (!loop || loop.geometryStatus !== 'source-road-geometry' || loop.closureStatus !== 'closed-directed-road-cycle' || !loop.geometry || loop.segments.length !== loop.orderedVillageIds.length || loop.segments.length < 2) return false;
  const coordinates = loop.geometry.coordinates;
  if (coordinates.length < 3 || !coordinates.every(p => p.length === 2 && p.every(Number.isFinite))) return false;
  const same = (a: TravelLoopCoordinate, b: TravelLoopCoordinate) => a[0] === b[0] && a[1] === b[1];
  if (!same(coordinates[0], coordinates[coordinates.length - 1])) return false;
  let vertex = 0;
  for (let i = 0; i < loop.segments.length; i++) {
    const segment = loop.segments[i], next = loop.segments[(i + 1) % loop.segments.length];
    if (segment.id !== loop.orderedSegmentIds[i] || segment.fromVillageId !== loop.orderedVillageIds[i] || segment.toVillageId !== loop.orderedVillageIds[(i + 1) % loop.orderedVillageIds.length]) return false;
    if (segment.nodeIds.length < 2 || segment.coordinates.length !== segment.nodeIds.length || segment.edgeWayIds.length !== segment.nodeIds.length - 1) return false;
    if (segment.startNodeId !== segment.nodeIds[0] || segment.endNodeId !== segment.nodeIds[segment.nodeIds.length - 1] || segment.endNodeId !== next.startNodeId) return false;
    for (let j = 0; j < segment.coordinates.length; j++) {
      if (vertex + j >= coordinates.length || !same(segment.coordinates[j], coordinates[vertex + j])) return false;
    }
    vertex += segment.coordinates.length - 1;
  }
  return vertex + 1 === coordinates.length && loop.audit.topologyVerified && loop.audit.coordinateContinuityVerified;
}
