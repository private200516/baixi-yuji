import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mapStyle, emptyCollection, type FeatureCollection } from '../src/geography/map-depth.ts';

const read = (path:string) => JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));

test('local building polygons retain actual OSM vertices and disclose illustrative height',()=>{
  const raw=read('data/geography/raw/village-detail.overpass.json');
  const buildings=read('public/geography/buildings.geojson') as FeatureCollection;
  assert.ok(buildings.features.length>0);
  for(const feature of buildings.features){
    const source=raw.elements.find((element:{id:number})=>element.id===feature.properties?.osmId);
    assert.ok(source?.tags?.building,'every footprint must correspond to a mapped building');
    assert.equal(feature.geometry.type,'Polygon');
    if(feature.geometry.type!=='Polygon')throw new Error('not polygon');
    assert.deepEqual(feature.geometry.coordinates[0],source.geometry.map((point:{lon:number;lat:number})=>[point.lon,point.lat]));
    assert.deepEqual(feature.geometry.coordinates[0][0],feature.geometry.coordinates[0].at(-1));
    if(!source.tags.height){assert.equal(feature.properties?.heightSource,'illustrative-uniform-6m');assert.equal(feature.properties?.displayHeight,6);}
    assert.match(String(feature.properties?.sourceUrl),/^https:\/\/www\.openstreetmap\.org\/way\/\d+$/);
  }
});

test('source checksums and coverage distinguish missing buildings from surveyed empty space',()=>{
  const source=read('data/geography/raw/village-detail.source.json');
  assert.equal(source.sha256,createHash('sha256').update(readFileSync(source.rawFile)).digest('hex'));
  assert.equal(source.license,'ODbL-1.0');assert.equal(source.coordinateSystem,'WGS84');assert.equal(source.radiusMeters,1000);
  const report=read('data/geography/village-detail-report.json');
  for(const [file,hash] of Object.entries(report.checksums))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),hash);
  assert.equal(Object.values(report.villageBuildingCounts).reduce((a:number,b)=>a+Number(b),0),report.counts.buildings);
  assert.match(report.coverageNote,/未取得完整建筑覆盖或 DEM/);
});

test('map keeps buildings local, disables invented terrain and uses no remote tiles',()=>{
  const style=mapStyle([emptyCollection,emptyCollection,emptyCollection],[emptyCollection,emptyCollection,emptyCollection]);
  assert.equal(style.terrain,undefined);assert.equal(style.glyphs,undefined);assert.equal(style.sprite,undefined);
  for(const source of Object.values(style.sources))assert.equal(source.type,'geojson');
  assert.equal(style.layers.find(layer=>layer.id==='building-models')?.minzoom,14);
  assert.equal(style.layers.find(layer=>layer.id==='building-footprints')?.minzoom,14);
  const routeLayer=style.layers.find(layer=>layer.id==='proposal-line');
  assert.ok(routeLayer&&'source' in routeLayer);assert.equal(routeLayer.source,'proposal');
});
