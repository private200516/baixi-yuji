import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-expect-error The offline preparation script is intentionally plain Node.js.
import { buildGraph, shortest, findSuggestion, distance, effectiveAccess } from '../scripts/prepare-route-research.mjs';
import { mapVillages } from '../src/data/villages.ts';
import type { RouteResearch } from '../src/geography/routeTypes.ts';

type Element = { type:string; id:number; nodes?:number[]; geometry?:{lon:number;lat:number}[]; tags?:Record<string,string>; members?:{type:string;role:string;ref:number}[] };
const way=(id:number,nodes:number[],tags:Record<string,string>={}):Element=>({type:'way',id,nodes,geometry:nodes.map(n=>({lon:121+n*.001,lat:29})),tags:{highway:'tertiary',...tags}});
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
test('one-way and reverse-way graphs compute independent return paths',()=>{
  const network=buildGraph([way(10,[1,2],{oneway:'yes'}),way(20,[2,3]),way(30,[3,1],{oneway:'yes'})]);
  assert.deepEqual(shortest(network,1,2).nodeIds,[1,2]);
  assert.deepEqual(shortest(network,2,1).nodeIds,[2,3,1]);
  const reverse=buildGraph([way(10,[1,2],{oneway:'-1'})]);
  assert.equal(shortest(reverse,1,2),null);assert.deepEqual(shortest(reverse,2,1).nodeIds,[2,1]);
  const roundabout=buildGraph([way(10,[1,2],{junction:'roundabout'})]);
  assert.equal(shortest(roundabout,2,1),null);
});
test('more specific access rules override generic access, without granting bus access to cars',()=>{
  assert.equal(effectiveAccess({access:'no',vehicle:'yes',motor_vehicle:'private'}),'private');
  assert.equal(shortest(buildGraph([way(1,[1,2],{vehicle:'no',bus:'yes'})]),1,2),null);
  assert.equal(shortest(buildGraph([way(1,[1,2],{access:'destination'})]),1,2),null);
  assert.deepEqual(shortest(buildGraph([way(1,[1,2],{access:'no',motor_vehicle:'yes'})]),1,2).nodeIds,[1,2]);
  const directional=buildGraph([way(1,[1,2],{'motor_vehicle:backward':'no'})]);
  assert.ok(shortest(directional,1,2));assert.equal(shortest(directional,2,1),null);
});
test('conditional, reversible, pedestrian and parking-only ways never become implied drivable roads',()=>{
  const restrictions:Record<string,string>[]=[{'motor_vehicle:conditional':'no @ (Mo-Fr 08:00-09:00)'},{oneway:'reversible'},{highway:'footway'},{highway:'service',service:'parking_aisle'},{ford:'yes'},{area:'yes'}];
  for(const tags of restrictions){
    assert.equal(shortest(buildGraph([way(1,[1,2],tags)]),1,2),null);
  }
});
test('unresolved turn restrictions and physical barriers are conservatively excluded',()=>{
  const restriction:Element={type:'relation',id:50,tags:{type:'restriction',restriction:'no_left_turn'},members:[{type:'way',role:'from',ref:10},{type:'node',role:'via',ref:2},{type:'way',role:'to',ref:20}]};
  const restricted=buildGraph([way(10,[1,2]),way(20,[2,3]),restriction]);
  assert.equal(shortest(restricted,1,3),null);assert.deepEqual(restricted.restrictions,[50]);
  assert.equal(shortest(buildGraph([way(10,[1,2,3]),{type:'node',id:2,tags:{barrier:'gate'}}]),1,3),null);
});
test('geometric crossings and conflicting shared coordinates never create fabricated connections',()=>{
  const a=way(1,[1,2]);const b=way(2,[3,4]);b.geometry=a.geometry;
  assert.equal(shortest(buildGraph([a,b]),1,4),null);
  const conflict=way(3,[2,3]);conflict.geometry![0].lon+=.1;
  const network=buildGraph([a,conflict]);
  assert.ok(network.conflicts.has(2));assert.equal(shortest(network,1,3),null);
});
test('nearby road anchors remain unverified, and distant anchors have null coordinates',()=>{
  const network=buildGraph([way(1,[1,2])]);
  const near=findSuggestion(network,{id:'near',coordinates:[121.001,29.0001]});
  assert.equal(near.status,'suggested-unverified');assert.equal(near.accessConnectionStatus,'unknown');
  const far=findSuggestion(network,{id:'far',coordinates:[122,30]});
  assert.equal(far.status,'unavailable');assert.equal(far.coordinates,null);assert.equal(far.nodeId,null);
  assert.ok(far.straightLineOffsetMeters>500);
});
test('every published route edge is an exact, permitted source edge and distance is its length sum',()=>{
  const data=load('public/geography/route-research.json') as RouteResearch;
  const base=load('data/geography/raw/roads.overpass.json').elements as Element[];
  const supplement=load('data/geography/raw/route-access.overpass.json').elements as Element[];
  const merged=new Map([...base,...supplement].map(e=>[e.type+'/'+e.id,e]));
  const network=buildGraph([...merged.values()]);
  const proofs=load('data/geography/reports/route-research.json').routeEdgeWayIds as Record<string,number[]>;
  assert.equal(data.routes.length,20);assert.equal(data.coverage.successfulRoutes,20);
  assert.equal(data.license,'ODbL-1.0');
  let independentlyDifferent=0;
  for(const route of data.routes){
    assert.equal(route.estimatedDurationSeconds,null);assert.equal(route.operatingStatus,'research-not-confirmed');
    if(route.geometryStatus==='unavailable'){assert.equal(route.coordinates,null);assert.equal(route.distanceMeters,null);assert.ok(route.unavailableReason);continue;}
    assert.equal(route.unavailableReason,null);
    assert.equal(route.coordinates!.length,route.nodeIds.length);assert.equal(proofs[route.id].length,route.nodeIds.length-1);
    let sum=0;
    for(let i=0;i<route.nodeIds.length;i++){
      assert.deepEqual(route.coordinates![i],network.nodes.get(route.nodeIds[i]));
      if(i>0){
        const edge=(network.graph.get(route.nodeIds[i-1])??[]).find((e:{to:number;way:number})=>e.to===route.nodeIds[i]&&e.way===proofs[route.id][i-1]);
        assert.ok(edge,'Missing exact directed source edge for '+route.id);sum+=edge.length;
      }
    }
    assert.equal(route.distanceMeters,Math.round(sum));
    const reverse=data.routes.find(r=>r.fromVillageId===route.toVillageId&&r.toVillageId===route.fromVillageId)!;
    if(JSON.stringify(route.coordinates!.slice().reverse())!==JSON.stringify(reverse.coordinates))independentlyDifferent++;
    const start=data.suggestions.find(s=>s.id===route.fromSuggestionId)!;
    const end=data.suggestions.find(s=>s.id===route.toSuggestionId)!;
    assert.deepEqual(route.coordinates![0],start.coordinates);assert.deepEqual(route.coordinates!.at(-1),end.coordinates);
  }
  assert.ok(independentlyDifferent>0,'Direction-specific routes must not all be reversed copies.');
  for(const suggestion of data.suggestions){
    const village=mapVillages.find(v=>v.id===suggestion.villageId)!;
    assert.equal(suggestion.status,'suggested-unverified');assert.equal(suggestion.accessConnectionStatus,'unknown');
    assert.notDeepEqual(suggestion.coordinates,village.normalizedCoordinate);
    assert.equal(suggestion.straightLineOffsetMeters,Math.round(distance(village.normalizedCoordinate,suggestion.coordinates)));
  }
});
