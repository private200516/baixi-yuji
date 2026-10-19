import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph, shortest, findSuggestion, distance } from './prepare-route-research.mjs';

export function permutations(values) {
  return values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];
}
const edgeKey = (a, b) => a < b ? `${a}/${b}` : `${b}/${a}`;
const sameCoordinate = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

/** Concatenate ONLY exact directed edges; the final return segment is mandatory. */
export function assembleCycle(network, segments) {
  if (segments.length < 2 || segments.some(segment => !segment || segment.nodeIds.length < 2)) return null;
  const nodeIds = [], edgeWayIds = [], coordinates = [];
  let distanceMeters = 0;
  for (let s = 0; s < segments.length; s++) {
    const part = segments[s], next = segments[(s + 1) % segments.length];
    if (part.nodeIds.at(-1) !== next.nodeIds[0] || !sameCoordinate(part.coordinates.at(-1), next.coordinates[0])) return null;
    if (part.nodeIds.length !== part.coordinates.length || part.edgeWayIds.length !== part.nodeIds.length - 1) return null;
    for (let i = 0; i < part.nodeIds.length; i++) {
      if (!sameCoordinate(part.coordinates[i], network.nodes.get(part.nodeIds[i]))) return null;
      if (i) {
        const edge = (network.graph.get(part.nodeIds[i - 1]) ?? []).find(e => e.to === part.nodeIds[i] && e.way === part.edgeWayIds[i - 1]);
        if (!edge) return null;
        distanceMeters += edge.length;
      }
    }
    nodeIds.push(...part.nodeIds.slice(s ? 1 : 0));
    coordinates.push(...part.coordinates.slice(s ? 1 : 0));
    edgeWayIds.push(...part.edgeWayIds);
  }
  return { nodeIds, edgeWayIds, coordinates, distanceMeters };
}

/** Physical edge reuse is based on exact node pairs, not proximity or street names. */
export function traceMetrics(trace) {
  const physical = new Map(), nodes = new Map(), reversals = [];
  for (let i = 0; i < trace.nodeIds.length - 1; i++) {
    const a = trace.nodeIds[i], b = trace.nodeIds[i + 1];
    const key = edgeKey(a, b), length = distance(trace.coordinates[i], trace.coordinates[i + 1]);
    const item = physical.get(key) ?? { nodeIds: a < b ? [a, b] : [b, a], length, count: 0, directions: new Set(), edgeIndices: [] };
    item.count++; item.directions.add(`${a}/${b}`); item.edgeIndices.push(i); physical.set(key, item);
    nodes.set(a, (nodes.get(a) ?? 0) + 1);
    const next = trace.nodeIds[(i + 2) % (trace.nodeIds.length - 1)];
    if (a === next) reversals.push(b);
  }
  const repeated = [...physical.values()].filter(edge => edge.count > 1);
  const extraRepeatedDistanceMeters = repeated.reduce((sum, edge) => sum + edge.length * (edge.count - 1), 0);
  return {
    directedEdgeCount: trace.edgeWayIds.length,
    uniquePhysicalEdgeCount: physical.size,
    extraRepeatedDistanceMeters: Math.round(extraRepeatedDistanceMeters),
    extraRepeatedDistanceRatio: extraRepeatedDistanceMeters / trace.distanceMeters,
    reverseTraversedPhysicalEdgeCount: repeated.filter(edge => edge.directions.size > 1).length,
    immediateReversalNodeIds: [...new Set(reversals)],
    repeatedNodeCount: [...nodes.values()].filter(count => count > 1).length,
    repeatedEdges: repeated.map(({ nodeIds, length, count, edgeIndices, directions }) => ({ nodeIds, distanceMeters: length, traversals: count, oppositeDirections: directions.size > 1, edgeIndices })),
  };
}

// Proper interior crossings only. Shared nodes/repeated physical edges are audited
// separately. A projected crossing is NOT a routable junction or an at-grade claim.
export function projectedCrossings(trace) {
  const crossings = [], seen = new Set();
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < trace.edgeWayIds.length; i++) {
    const a = trace.coordinates[i], b = trace.coordinates[i + 1];
    for (let j = i + 2; j < trace.edgeWayIds.length; j++) {
      const ids = [trace.nodeIds[i], trace.nodeIds[i + 1], trace.nodeIds[j], trace.nodeIds[j + 1]];
      if (new Set(ids).size !== 4) continue;
      const c = trace.coordinates[j], d = trace.coordinates[j + 1];
      if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue;
      if (cross(a, b, c) * cross(a, b, d) >= 0 || cross(c, d, a) * cross(c, d, b) >= 0) continue;
      const key = [edgeKey(ids[0], ids[1]), edgeKey(ids[2], ids[3])].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      crossings.push({ edgeIndices: [i, j], nodeIds: ids, wayIds: [trace.edgeWayIds[i], trace.edgeWayIds[j]], interpretation: 'projected-crossing-only-not-a-graph-junction' });
    }
  }
  return crossings;
}

export function researchCandidates(network, references) {
  const paths = new Map();
  // Even opposite directions are independently solved, preserving oneway/access.
  for (const from of references) for (const to of references) {
    if (from.id !== to.id) paths.set(`${from.villageId}-${to.villageId}`, shortest(network, from.nodeId, to.nodeId));
  }
  const candidates = permutations(references.slice(1).map(r => r.villageId)).map(rest => {
    const order = [references[0].villageId, ...rest];
    const segmentIds = order.map((id, i) => `${id}-${order[(i + 1) % order.length]}`);
    const segments = segmentIds.map(id => paths.get(id));
    const trace = assembleCycle(network, segments);
    return { order, segmentIds, trace, metrics: trace ? traceMetrics(trace) : null };
  });
  // Compare shortest directed tours, then reuse. Keep every alternative for review.
  candidates.sort((a, b) => (a.trace?.distanceMeters ?? Infinity) - (b.trace?.distanceMeters ?? Infinity) || (a.metrics?.extraRepeatedDistanceMeters ?? Infinity) - (b.metrics?.extraRepeatedDistanceMeters ?? Infinity));
  return { candidates, paths };
}

async function main() {
  const sources = [];
  const merged = new Map();
  for (const stem of ['roads', 'route-access']) {
    const metadataPath = `data/geography/raw/${stem}.source.json`, rawPath = `data/geography/raw/${stem}.overpass.json`;
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')), raw = await readFile(rawPath);
    const sha256 = createHash('sha256').update(raw).digest('hex');
    if (metadata.sha256 !== sha256) throw new Error(`Source checksum mismatch: ${rawPath}`);
    const source = JSON.parse(raw.toString('utf8'));
    for (const element of source.elements) merged.set(`${element.type}/${element.id}`, element);
    sources.push({ id: `osm-${stem}`, metadataPath, rawPath, sha256, retrievedAt: metadata.retrievedAt, osmBaseTimestamp: metadata.osmBaseTimestamp, coordinateSystem: 'EPSG:4326', coordinateTransformation: 'none', endpoint: metadata.endpoint });
  }
  const network = buildGraph([...merged.values()]);
  const { mapVillages } = await import('../src/data/villages.ts');
  const ids = ['qingtan', 'longgong', 'xujiashan', 'meizhitian', 'ruoao'];
  const references = ids.map(id => {
    const village = mapVillages.find(v => v.id === id);
    if (!village?.normalizedCoordinate) throw new Error(`Missing verified village ${id}`);
    return findSuggestion(network, { id, coordinates: village.normalizedCoordinate });
  });
  const { candidates, paths } = researchCandidates(network, references);
  const selected = candidates.find(candidate => candidate.trace);
  const sourceRefs = sources.map(source => source.id);
  const segments = selected ? selected.segmentIds.map((id, i) => {
    const path = paths.get(id), fromVillageId = selected.order[i], toVillageId = selected.order[(i + 1) % selected.order.length];
    return { id, fromVillageId, toVillageId, fromReferencePointId: `suggested-${fromVillageId}`, toReferencePointId: `suggested-${toVillageId}`, startNodeId: path.nodeIds[0], endNodeId: path.nodeIds.at(-1), nodeIds: path.nodeIds, edgeWayIds: path.edgeWayIds, coordinates: path.coordinates, distanceMeters: path.distanceMeters, durationSeconds: null, sourceRefs };
  }) : [];
  const crossings = selected ? projectedCrossings(selected.trace) : [];
  const metrics = selected?.metrics;
  const order = selected?.order ?? ids;
  const names = order.map(id => mapVillages.find(v => v.id === id).displayName);
  const result = {
    id: 'ninghai-five-villages-travel-loop', version: '2026-10-19-directed-loop-v1', name: '五村规划环线',
    status: 'research-not-operating', orderedVillageIds: order, orderedSegmentIds: selected?.segmentIds ?? [],
    referencePointIds: order.map(id => `suggested-${id}`), referencePoints: order.map(id => references.find(r => r.villageId === id)), segments,
    geometry: selected ? { type: 'LineString', coordinates: selected.trace.coordinates } : null,
    geometryStatus: selected ? 'source-road-geometry' : 'incomplete', closureStatus: selected ? 'closed-directed-road-cycle' : 'blocked',
    direction: 'ordered-directed', directionLabel: names.concat(names[0]).join(' → '),
    distanceMeters: selected ? Math.round(selected.trace.distanceMeters) : null, durationSeconds: null,
    coordinateSystem: 'EPSG:4326', coordinateTransformation: 'none', sourceRefs, sources,
    checkedAt: '2026-10-19', attribution: '© OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright', license: 'ODbL-1.0',
    unresolvedIssues: [
      ...(selected ? [] : ['环线闭合路段待核验；未绘制虚假闭合线，完整长度为空。']),
      '规划环线／非运营信息。仅证明保存的道路样本有向连通；不证明大客车可通行。',
      '样本获取于2026年10月8—9日；现场限高、限宽、承载、转弯、动态封路与转向限制仍待核验。',
      '道路参考点与古村代表点分开；未核验上下客、过街、候车空间或村内步行连接，不提供精准导航。',
      '完整环游含局部重复道路和折返，非简单圆环；投影交叉不自动当作路口。',
      '逆向环游尚未选型与核验；不提供倒序切换。时间、运营服务与正式上下客点均未知。',
    ],
    audit: {
      candidateCount: candidates.length, directedEdgeCount: metrics?.directedEdgeCount ?? 0, uniquePhysicalEdgeCount: metrics?.uniquePhysicalEdgeCount ?? 0,
      extraRepeatedDistanceMeters: metrics?.extraRepeatedDistanceMeters ?? 0, extraRepeatedDistanceRatio: metrics?.extraRepeatedDistanceRatio ?? 0,
      reverseTraversedPhysicalEdgeCount: metrics?.reverseTraversedPhysicalEdgeCount ?? 0, immediateReversalNodeIds: metrics?.immediateReversalNodeIds ?? [],
      projectedCrossingCount: crossings.length, repeatedNodeCount: metrics?.repeatedNodeCount ?? 0, topologyVerified: !!selected, coordinateContinuityVerified: !!selected,
      selectionMethod: 'Independent directed Dijkstra for all 20 ordered pairs; all 24 five-village tours with Qingtan fixed as the browsing origin, including each return segment. Select shortest complete source-edge tour, tie-break by extra physical-edge reuse. Not an operational route optimization.',
    },
    evidence: {
      candidateSummaries: candidates.map(c => ({ orderedVillageIds: c.order, closureAvailable: !!c.trace, distanceMeters: c.trace ? Math.round(c.trace.distanceMeters) : null, extraRepeatedDistanceMeters: c.metrics?.extraRepeatedDistanceMeters ?? null, extraRepeatedDistanceRatio: c.metrics?.extraRepeatedDistanceRatio ?? null })),
      repeatedEdges: metrics?.repeatedEdges ?? [], projectedCrossings: crossings,
      roadWays: [...new Set(segments.flatMap(segment => segment.edgeWayIds))].map(id => { const way = network.acceptedWays.get(id); return { id, tags: way.tags, nodeIds: way.nodes, sourceRef: 'osm-route-access', url: `https://www.openstreetmap.org/way/${id}` }; }),
      excludedWayCount: network.excluded.length, blockedNodeIds: [...network.blockedNodes], conflictingNodeIds: [...network.conflicts], restrictionRelationIds: network.restrictions,
    },
  };
  await writeFile('public/geography/travel-loop.json', JSON.stringify(result));
  console.log(JSON.stringify({ order: result.directionLabel, closureStatus: result.closureStatus, distanceMeters: result.distanceMeters, audit: result.audit }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
