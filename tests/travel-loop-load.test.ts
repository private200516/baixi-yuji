import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readTravelLoop } from '../src/geography/loadTravelLoop.ts';
const source = JSON.parse(readFileSync(new URL('../public/geography/travel-loop.json', import.meta.url), 'utf8'));
test('loop loader accepts the closed source and keeps a proven partial route without inventing a total', () => {
  assert.equal(readTravelLoop(source).distanceMeters, 143880);
  const partial = { ...source, closureStatus: 'blocked', geometryStatus: 'incomplete', geometry: null, distanceMeters: null, segments: source.segments.slice(0, -1) };
  assert.equal(readTravelLoop(partial).segments.length, 4);
  assert.throws(() => readTravelLoop({ ...partial, distanceMeters: 143880 }));
});
test('invalid village identity, a disconnected closing export, and malformed geometry are rejected', () => {
  assert.throws(() => readTravelLoop(null));
  assert.throws(() => readTravelLoop({ ...source, orderedVillageIds: ['invented-village'] }));
  assert.throws(() => readTravelLoop({ ...source, segments: source.segments.slice(0, -1) }));
  assert.throws(() => readTravelLoop({ ...source, geometry: { type: 'LineString', coordinates: [[Infinity, 29]] } }));
  assert.throws(() => readTravelLoop({ ...source, geometry: { type: 'LineString', coordinates: null } }));
  for (const field of ['topologyVerified', 'coordinateContinuityVerified']) {
    assert.throws(() => readTravelLoop({ ...source, audit: { ...source.audit, [field]: 'unverified' } }));
  }
});
