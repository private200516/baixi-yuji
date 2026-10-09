/** Road research is separate from Village, verified BoardingPoint, and Service. */
export type RoadSuggestion = {
  id: string; villageId: string; nodeId: number | null; coordinates: [number, number] | null;
  status: 'suggested-unverified' | 'unavailable'; straightLineOffsetMeters: number | null;
  accessConnectionStatus: 'unknown'; note: string;
};
export type ResearchRoute = {
  id: string; fromVillageId: string; toVillageId: string; fromSuggestionId: string; toSuggestionId: string;
  source: string; profile: 'directed-road-connectivity-research'; retrievedAt: string;
  geometryStatus: 'source-road-geometry' | 'unavailable'; distanceMeters: number | null;
  estimatedDurationSeconds: null; operatingStatus: 'research-not-confirmed';
  coordinates: [number, number][] | null; nodeIds: number[]; wayIds: number[];
  riskNote: string; unavailableReason: string | null;
};
export type RouteResearch = {
  version: string; checkedAt: string; license: 'ODbL-1.0'; attribution: string;
  attributionUrl: string; suggestions: RoadSuggestion[]; routes: ResearchRoute[];
  method: string; mainlineCandidate: string[]; mainlineStatus: 'research-order-only-not-an-operating-line';
  excludedWays: number;
  coverage: { nodeCount: number; wayCount: number; directedEdgeCount: number; successfulRoutes: number; requestedRoutes: number; limitation: string };
};
