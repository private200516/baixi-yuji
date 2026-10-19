import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapVillages } from '../src/data/villages.ts';
import { villagePois, getVillagePois, getMappableVillagePois, getPoiById, isMappablePoi, poiCategoryLabels } from '../src/geography/poiCatalog.ts';

test('all five researched villages have sourced introductions without requiring a location', () => {
  assert.equal(new Set(villagePois.map(poi => poi.id)).size, villagePois.length);
  for (const village of mapVillages) {
    const pois = getVillagePois(village.id);
    assert.ok(pois.length > 0, `${village.id} is missing its first POI sample`);
    for (const poi of pois) {
      assert.ok(poi.summary.length >= 60 && poi.summary.length <= 120, poi.id);
      assert.ok(poi.identitySources.length && poi.summarySources.length, poi.id);
      assert.ok(poiCategoryLabels[poi.category]);
      assert.equal(poi.checkedAt, '2026-10-19');
      assert.ok([...poi.identitySources, ...poi.summarySources, ...poi.coordinateSources].every(source => new URL(source.url).protocol === 'https:'));
      assert.equal(poi.publicAccessStatus, 'unknown');
      assert.ok(poi.publicAccessNote.length > 0);
      assert.equal(poi.image, null, 'No photograph is licensed for this first sample');
    }
  }
});

test('unknown coordinates stay in the text catalog and never become village or passenger-stop locations', () => {
  const pending = villagePois.filter(poi => poi.verificationStatus.coordinates === 'pending');
  assert.ok(pending.length > 0);
  for (const poi of pending) {
    assert.equal(poi.originalCoordinate, null);
    assert.equal(poi.normalizedCoordinate, null);
    assert.equal(poi.coordinatePurpose, null);
    assert.deepEqual(poi.coordinateSources, []);
    assert.ok(getVillagePois(poi.villageId).includes(poi));
    assert.ok(!getMappableVillagePois(poi.villageId).includes(poi));
  }
  for (const poi of villagePois.filter(isMappablePoi)) {
    assert.notDeepEqual(poi.normalizedCoordinate, mapVillages.find(village => village.id === poi.villageId)?.normalizedCoordinate);
    assert.equal(poi.coordinatePurpose, 'published-reference-point');
    assert.match(poi.coordinatePrecisionNote, /非|不/);
  }
});

test('published coordinates retain longitude-latitude order and original source values', () => {
  const shuangzhi = getPoiById('qingtan-shuangzhi')!;
  const chen = getPoiById('longgong-chen-hall')!;
  const dms = (degrees: number, minutes: number, seconds: number) => degrees + minutes / 60 + seconds / 3600;
  for (const [poi, expected] of [[shuangzhi, [dms(121, 17, 31.58), dms(29, 25, 57.29)]], [chen, [dms(121, 16, 29.50), dms(29, 22, 28.54)]]] as const) {
    assert.deepEqual(poi.originalCoordinate?.coordinates, poi.normalizedCoordinate);
    assert.equal(poi.originalCoordinate?.crs, 'EPSG:4326');
    expected.forEach((value, index) => assert.ok(Math.abs(value - poi.normalizedCoordinate![index]) < 0.00000005));
    assert.match(poi.coordinateSources[0].url, /oldid=/, 'Coordinate evidence should pin the reviewed encyclopedia revision');
  }
  const raw = JSON.parse(readFileSync(new URL('../data/geography/poi-evidence/pois.overpass.json', import.meta.url), 'utf8'));
  const water = raw.elements.find((element: { type: string; id: number }) => element.type === 'way' && element.id === 1210271570);
  assert.equal(water.tags.name, '申坎头水库');
  assert.equal(water.tags.water, 'reservoir');
  assert.deepEqual(getPoiById('meizhitian-shenkantou')!.normalizedCoordinate, [water.center.lon, water.center.lat]);
});

test('the mapping boundary rejects pending identity, pending summary, missing evidence, and invalid pairs', () => {
  const good = getPoiById('qingtan-shuangzhi')!;
  assert.ok(isMappablePoi(good));
  assert.ok(!isMappablePoi({ ...good, verificationStatus: { ...good.verificationStatus, identity: 'pending' } }));
  assert.ok(!isMappablePoi({ ...good, verificationStatus: { ...good.verificationStatus, summary: 'pending' } }));
  assert.ok(!isMappablePoi({ ...good, verificationStatus: { ...good.verificationStatus, coordinates: 'pending' } }));
  assert.ok(!isMappablePoi({ ...good, coordinateSources: [] }));
  assert.ok(!isMappablePoi({ ...good, normalizedCoordinate: [121, Number.NaN] }));
  assert.ok(!isMappablePoi({ ...good, normalizedCoordinate: [181, 29] }));
  assert.ok(!isMappablePoi({ ...good, normalizedCoordinate: [121, 91] }));
});

test('unknown IDs have explicit empty results without borrowing another village content', () => {
  assert.deepEqual(getVillagePois('not-a-village'), []);
  assert.deepEqual(getMappableVillagePois('not-a-village'), []);
  assert.equal(getPoiById('missing'), undefined);
  assert.equal(getPoiById(null), undefined);
  assert.equal(getPoiById(undefined), undefined);
  assert.ok(getMappableVillagePois('xujiashan').length === 0 && getVillagePois('xujiashan').length > 0);
  assert.ok(getMappableVillagePois('ruoao').length === 0 && getVillagePois('ruoao').length > 0);
});
