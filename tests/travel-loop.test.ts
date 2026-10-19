import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
// @ts-expect-error Offline preparation deliberately remains plain Node.js.
import { buildGraph, shortest, distance } from '../scripts/prepare-route-research.mjs';
// @ts-expect-error Offline preparation deliberately remains plain Node.js.
import { assembleCycle, traceMetrics, projectedCrossings, researchCandidates } from '../scripts/prepare-travel-loop.mjs';
import { hasClosedTravelLoop } from '../src/geography/travelLoop.ts';
import type { TravelLoop } from '../src/geography/travelLoop.ts';
import { boardingPoints, services, mapVillages } from '../src/data/villages.ts';

const load = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const loop = load('public/geography/travel-loop.json') as TravelLoop;
type Element = { type: string; id: number; nodes: number[]; geometry: { lon: number; lat: number }[]; tags: Record<string, string> };
const way = (id: number, nodes: number[], positions: Record<number, [number, number]>, tags: Record<string, string> = {}): Element => ({ type: 'way', id, nodes, geometry: nodes.map(node => ({ lon: positions[node][0], lat: positions[node][1] })), tags: { highway: 'tertiary', ...tags } });
const p: Record<number, [number, number]> = { 1: [121, 29], 2: [121.01, 29], 3: [121.01, 29.01], 4: [121, 29.01] };
const rawElements = ['roads', 'route-access'].flatMap(name => load(`data/geography/raw/${name}.overpass.json`).elements);
const merged = new Map(rawElements.map(element => [`${element.type}/${element.id}`, element]));
const network = buildGraph([...merged.values()]);

test('closing segment must follow permitted source edges and exactly shared node IDs', () => {
  const graph = buildGraph([way(10, [1, 2, 3, 4, 1], p, { oneway: 'yes' })]);
  const outward = shortest(graph, 1, 3), back = shortest(graph, 3, 1);
  assert.deepEqual(assembleCycle(graph, [outward, back]).nodeIds, [1, 2, 3, 4, 1]);
  assert.equal(assembleCycle(graph, [outward]), null);
  assert.equal(assembleCycle(graph, [outward, null]), null);
  // Closing by appending the first coordinate would invent the forbidden 3 -> 1 edge.
  assert.equal(assembleCycle(graph, [outward, { nodeIds: [3, 1], coordinates: [p[3], p[1]], edgeWayIds: [10] }]), null);
  // Reversing outbound vertices would violate the independently checked direction.
  assert.equal(assembleCycle(graph, [outward, { ...outward, nodeIds: [...outward.nodeIds].reverse(), coordinates: [...outward.coordinates].reverse() }]), null);
  const altered = structuredClone(back); altered.coordinates[1][0] += .001;
  assert.equal(assembleCycle(graph, [outward, altered]), null);
});

test('equal coordinates with different node IDs cannot fake connected closure', () => {
  const positions = { ...p, 5: p[3], 6: p[1] };
  const graph = buildGraph([way(10, [1, 2, 3], positions), way(20, [5, 4, 6], positions)]);
  assert.equal(assembleCycle(graph, [shortest(graph, 1, 3), shortest(graph, 5, 6)]), null);
});

test('out-and-back repetition and projected self-crossing have independent diagnostics', () => {
  const graph = buildGraph([way(10, [1, 2, 3], p)]);
  const trace = assembleCycle(graph, [shortest(graph, 1, 3), shortest(graph, 3, 1)]);
  const metrics = traceMetrics(trace);
  assert.equal(metrics.reverseTraversedPhysicalEdgeCount, 2);
  assert.ok(Math.abs(metrics.extraRepeatedDistanceRatio - .5) < .00001);
  const crossing = { nodeIds: [1, 3, 2, 4, 1], edgeWayIds: [10, 20, 30, 40], coordinates: [p[1], p[3], p[2], p[4], p[1]] };
  assert.equal(projectedCrossings(crossing).length, 1);
});

test('published loop has a real return leg and every directed edge matches original geometry', () => {
  assert.ok(hasClosedTravelLoop(loop));
  assert.equal(loop.segments.length, 5);
  assert.deepEqual(new Set(loop.orderedVillageIds), new Set(mapVillages.map(v => v.id)));
  assert.equal(loop.orderedVillageIds[0], 'qingtan');
  assert.deepEqual(loop.orderedVillageIds, ['qingtan', 'longgong', 'ruoao', 'meizhitian', 'xujiashan']);
  const trace = assembleCycle(network, loop.segments);
  assert.ok(trace);
  assert.deepEqual(trace.coordinates, loop.geometry!.coordinates);
  assert.equal(Math.round(trace.distanceMeters), loop.distanceMeters);
  assert.equal(trace.nodeIds[0], trace.nodeIds.at(-1));
  assert.equal(loop.segments.at(-1)!.id, 'xujiashan-qingtan');
  for (const segment of loop.segments) {
    const independentlySolved = shortest(network, segment.startNodeId, segment.endNodeId);
    assert.deepEqual(segment.nodeIds, independentlySolved.nodeIds);
    assert.deepEqual(segment.edgeWayIds, independentlySolved.edgeWayIds);
    assert.equal(segment.distanceMeters, independentlySolved.distanceMeters);
    assert.equal(segment.durationSeconds, null);
  }
  const metrics = traceMetrics(trace);
  assert.equal(metrics.extraRepeatedDistanceMeters, loop.audit.extraRepeatedDistanceMeters);
  assert.equal(metrics.extraRepeatedDistanceRatio, loop.audit.extraRepeatedDistanceRatio);
  assert.equal(metrics.reverseTraversedPhysicalEdgeCount, 236);
  assert.deepEqual(metrics.immediateReversalNodeIds, loop.audit.immediateReversalNodeIds);
  assert.equal(projectedCrossings(trace).length, loop.audit.projectedCrossingCount);
  assert.ok(metrics.extraRepeatedDistanceRatio < .1, 'The selected loop must not be an ordinary out-and-back redrawn twice.');
});

test('selection compares all directed five-village tours including the return distance', () => {
  const { candidates } = researchCandidates(network, loop.referencePoints);
  assert.equal(candidates.length, 24);
  assert.equal(candidates.filter((candidate: { trace: unknown }) => candidate.trace).length, 24);
  assert.deepEqual(candidates[0].order, loop.orderedVillageIds);
  assert.equal(Math.round(candidates[0].trace.distanceMeters), loop.distanceMeters);
  assert.equal(candidates[0].metrics.extraRepeatedDistanceMeters, loop.audit.extraRepeatedDistanceMeters);
  assert.ok(candidates.every((candidate: { metrics: { extraRepeatedDistanceRatio: number } }) => candidate.metrics.extraRepeatedDistanceRatio >= loop.audit.extraRepeatedDistanceRatio));
});

test('reference points, permissions and source metadata remain separate from passenger service', () => {
  assert.equal(loop.status, 'research-not-operating');
  assert.equal(loop.durationSeconds, null);
  assert.equal(loop.coordinateSystem, 'EPSG:4326');
  assert.equal(loop.coordinateTransformation, 'none');
  assert.equal(loop.license, 'ODbL-1.0');
  assert.equal(boardingPoints.length, 0); assert.equal(services.length, 0);
  for (const reference of loop.referencePoints) {
    assert.equal(reference.accessConnectionStatus, 'unknown');
    const village = mapVillages.find(v => v.id === reference.villageId)!;
    assert.notDeepEqual(reference.coordinates, village.normalizedCoordinate);
    assert.deepEqual(reference.coordinates, network.nodes.get(reference.nodeId));
    assert.equal(reference.straightLineOffsetMeters, Math.round(distance(reference.coordinates, village.normalizedCoordinate)));
  }
  for (const name of ['roads', 'route-access']) {
    const metadata = load(`data/geography/raw/${name}.source.json`);
    assert.equal(createHash('sha256').update(readFileSync(metadata.rawFile)).digest('hex'), metadata.sha256);
  }
});

test('runtime guard refuses truncated geometry, disconnected IDs and fabricated simple closure', () => {
  const incomplete = structuredClone(loop); incomplete.geometry!.coordinates.pop();
  assert.equal(hasClosedTravelLoop(incomplete), false);
  const displaced = structuredClone(loop); displaced.segments[1].startNodeId += 1;
  assert.equal(hasClosedTravelLoop(displaced), false);
  const wrongOrder = structuredClone(loop); wrongOrder.orderedVillageIds.reverse();
  assert.equal(hasClosedTravelLoop(wrongOrder), false);
  const fake = structuredClone(loop); fake.geometry!.coordinates = [fake.geometry!.coordinates[0], fake.geometry!.coordinates[1], fake.geometry!.coordinates[0]];
  assert.equal(hasClosedTravelLoop(fake), false);
  const blocked = structuredClone(loop); blocked.closureStatus = 'blocked'; blocked.geometry = null; blocked.distanceMeters = null;
  assert.equal(hasClosedTravelLoop(blocked), false);
});
