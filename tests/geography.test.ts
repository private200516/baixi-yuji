import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { villages, mapVillages, isMappable, boardingPoints, routeProposals, services } from '../src/data/villages.ts';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
test('current geographic UI text/action palette meets AA contrast',()=>{
  function luminance(hex:string){const rgb=hex.match(/../g)!.map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
  for(const [text,background] of [['34383A','EDE9DD'],['476160','F4F0E6'],['F4F0E6','486666'],['F1C98C','355B5A']]){const a=luminance(text),b=luminance(background);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${text}/${background}`);}
});
function inside([x,y]:number[], ring:number[][]){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)result=!result;}return result;}
test('only sourced heritage settlements with coordinates become passenger map nodes',()=>{
  assert.equal(mapVillages.length,5);assert.equal(new Set(villages.map(v=>v.id)).size,villages.length);
  for(const v of villages){assert.equal(v.checkedAt,'2026-10-08');assert.equal(v.boardingStatus,'unverified');assert.deepEqual(v.boardingPointIds,[]);if(isMappable(v)){assert.ok(v.identitySources.length);assert.ok(v.heritageEvidence);assert.ok(v.geographySources[0].url.startsWith('https://www.openstreetmap.org/node/'));assert.deepEqual(v.originalCoordinate?.coordinates,v.normalizedCoordinate);assert.equal(v.originalCoordinate?.crs,'EPSG:4326');assert.equal(v.sourceLicense,'ODbL-1.0');assert.equal(v.representativePointType,'mapped-settlement-point');}else{assert.equal(v.normalizedCoordinate,null);assert.equal(v.originalCoordinate,null);}}
  assert.deepEqual([boardingPoints,routeProposals,services],[[],[],[]]);
  assert.equal(villages.find(v=>v.id==='qiantong')?.normalizedCoordinate,null);
  assert.equal(villages.find(v=>v.id==='dongxiang')?.heritageStatus,'unknown');
});
test('geographic points belong to the unchanged, closed real county polygon',()=>{
  const county=read('public/geography/boundary.geojson').features[0].geometry.coordinates as number[][][][];
  for(const polygon of county) for(const ring of polygon){assert.deepEqual(ring[0],ring.at(-1));assert.ok(ring.length>=4);}
  for(const v of mapVillages)assert.ok(county.some(p=>inside(v.normalizedCoordinate!,p[0])&&!p.slice(1).some(h=>inside(v.normalizedCoordinate!,h))),v.displayName);
});
test('road/water export preserves the exact original way vertices and source licensing',()=>{
  const manifest=read('public/geography/manifest.json');assert.equal(manifest.crs,'EPSG:4326');assert.equal(manifest.attribution.license,'ODbL-1.0');
  for(const layer of ['roads','water']){
    const original=read(`data/geography/raw/${layer}.overpass.json`);const features=read(`public/geography/${layer}.geojson`).features;const raw=new Map(original.elements.map((e:{id:number})=>[e.id,e]));
    assert.equal(features.length,manifest.counts[layer]);assert.ok(features.length>100);
    for(const f of features){const source=raw.get(f.properties.osmId) as {geometry:{lon:number;lat:number}[]};const positions=f.geometry.type==='Polygon'?f.geometry.coordinates[0]:f.geometry.coordinates;assert.deepEqual(positions,source.geometry.map(p=>[p.lon,p.lat]));for(const p of positions){assert.ok(Number.isFinite(p[0])&&Number.isFinite(p[1]));assert.ok(p[0]>120&&p[0]<123&&p[1]>28&&p[1]<31);}}
    assert.equal(read(`data/geography/raw/${layer}.source.json`).license,'ODbL-1.0');
  }
});
