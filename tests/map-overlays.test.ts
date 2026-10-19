import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clusterScreenPois, isCameraSnapshot, loopFeatureCollection, loopDirectionCollection } from '../src/geography/map-overlays.ts';
import { emptyCollection, mapStyle } from '../src/geography/map-depth.ts';
import type { TravelLoop } from '../src/geography/travelLoop.ts';

test('dense POIs share a target anchored to an actual member, with no overlapping separate targets',()=>{
  const points=[{id:'a',x:10,y:10},{id:'b',x:45,y:15},{id:'c',x:82,y:22},{id:'d',x:180,y:22}];
  const clusters=clusterScreenPois(points);
  assert.deepEqual(clusters.map(group=>group.map(p=>p.id)),[['a','b','c'],['d']]);
  assert.equal(clusters[0][0],points[0]);
  assert.deepEqual(points.map(({x,y})=>[x,y]),[[10,10],[45,15],[82,22],[180,22]]);
  for(let i=0;i<clusters.length;i++)for(let j=i+1;j<clusters.length;j++)for(const a of clusters[i])for(const b of clusters[j])assert.ok(Math.abs(a.x-b.x)>=48||Math.abs(a.y-b.y)>=48);
});

test('loop and selected interval retain independent source and layer stacks',()=>{
  const style=mapStyle([emptyCollection,emptyCollection,emptyCollection],[emptyCollection,emptyCollection,emptyCollection]);
  assert.ok(style.sources['travel-loop']);assert.ok(style.sources.proposal);assert.ok(style.sources['village-pois']);
  assert.equal(style.layers.find(layer=>layer.id==='travel-loop-line')?.type,'line');
  const arrows=style.layers.find(layer=>layer.id==='loop-direction-arrows');assert.ok(arrows&&arrows.type==='symbol');assert.equal(arrows.layout?.['icon-image'],'loop-direction');
  assert.ok(style.layers.findIndex(layer=>layer.id==='proposal-line')>style.layers.findIndex(layer=>layer.id==='travel-loop-line'));
});

test('partial loop exports preserve disconnected researched roads without connecting the gap',()=>{
  const loop=JSON.parse(readFileSync('public/geography/travel-loop.json','utf8')) as TravelLoop;
  const complete=loopFeatureCollection(loop);assert.equal(complete.features.length,1);assert.deepEqual(complete.features[0].geometry,loop.geometry);
  const partial={...loop,geometry:null,closureStatus:'blocked' as const,geometryStatus:'incomplete' as const,segments:loop.segments.slice(0,2)};
  const collection=loopFeatureCollection(partial);assert.equal(collection.features.length,2);
  collection.features.forEach((feature,index)=>assert.deepEqual(feature.geometry,{type:'LineString',coordinates:partial.segments[index].coordinates}));
  const arrows=loopDirectionCollection(loop);assert.equal(arrows.features.length,loop.segments.length);
  arrows.features.forEach((feature,index)=>{assert.equal(feature.geometry.type,'Point');assert.ok(loop.segments[index].coordinates.includes(feature.geometry.coordinates as [number,number]));assert.ok(Number.isFinite(feature.properties?.bearing));});
});

test('camera restore accepts bounded saved views and rejects invalid coordinates',()=>{
  assert.equal(isCameraSnapshot({center:[121.5,29.3],zoom:14,bearing:0,pitch:0}),true);
  assert.equal(isCameraSnapshot({center:[NaN,29.3],zoom:14,bearing:0,pitch:0}),false);
  assert.equal(isCameraSnapshot({center:[121.5,29.3],zoom:25,bearing:0,pitch:0}),false);
  assert.equal(isCameraSnapshot(null),false);
});
