import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const highwayClasses = new Set(['motorway','trunk','primary','secondary','tertiary','motorway_link','trunk_link','primary_link','secondary_link','tertiary_link','unclassified','residential','service']);
const suggestionClasses = new Set(['primary','secondary','tertiary','unclassified']);
const openAccess = new Set(['yes','designated','permissive']);
const trueValues = new Set(['yes','1','true']);
const falseValues = new Set(['no','0','false']);
const relevantConditional = /^(access|vehicle|motor_vehicle|motorcar|oneway|restriction|bus|psv)(:.*)?:conditional$/;

export function distance(a,b) {
  const r=Math.PI/180,dy=(b[1]-a[1])*r,dx=(b[0]-a[0])*r;
  const h=Math.sin(dy/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dx/2)**2;
  return 6371008.8*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
// More specific motorcar/motor_vehicle tags override generic vehicle/access tags.
export function effectiveAccess(tags,direction) {
  for(const key of ['motorcar','motor_vehicle','vehicle','access']) {
    if(direction && tags[key+':'+direction]!==undefined)return tags[key+':'+direction];
    if(tags[key]!==undefined)return tags[key];
  }
  return undefined;
}
function accessAllowed(value){return value===undefined || openAccess.has(value);}
function onewayValue(t){return t['oneway:motorcar']??t['oneway:motor_vehicle']??t['oneway:vehicle']??t.oneway??(t.junction==='roundabout'||t.highway==='motorway'?'yes':'no');}
function validGeometry(w){return Array.isArray(w.nodes)&&w.nodes.length>=2&&w.nodes.length===w.geometry?.length&&w.geometry.every(p=>Number.isFinite(p?.lon)&&Number.isFinite(p?.lat)&&Math.abs(p.lon)<=180&&Math.abs(p.lat)<=90);}

export function buildGraph(elements) {
  const nodes=new Map(),graph=new Map(),acceptedWays=new Map(),ordinary=new Set(),excluded=[];
  const restrictedWays=new Set(),restrictions=[];
  // A node-only graph cannot safely interpret via-way or conditional turn rules.
  // Conservatively omit every participating way rather than ignore those rules.
  for(const r of elements.filter(e=>e.type==='relation'&&e.tags?.type==='restriction')){
    restrictions.push(r.id);
    for(const m of r.members??[])if(m.type==='way')restrictedWays.add(m.ref);
  }
  const blockedNodes=new Set(elements.filter(e=>e.type==='node'&&(
    (e.tags?.barrier&&e.tags.barrier!=='no')||(e.tags?.ford&&e.tags.ford!=='no')||
    !accessAllowed(effectiveAccess(e.tags??{}))||Object.keys(e.tags??{}).some(k=>relevantConditional.test(k))
  )).map(e=>e.id));
  const positions=new Map(),conflicts=new Set();
  for(const w of elements.filter(e=>e.type==='way'&&validGeometry(e)))w.nodes.forEach((id,i)=>{
    const p=[w.geometry[i].lon,w.geometry[i].lat],old=positions.get(id);
    if(old&&(old[0]!==p[0]||old[1]!==p[1]))conflicts.add(id);
    positions.set(id,p);
  });
  function edge(a,b,w){
    if(a===b||blockedNodes.has(a)||blockedNodes.has(b)||conflicts.has(a)||conflicts.has(b))return;
    const length=distance(nodes.get(a),nodes.get(b));if(!Number.isFinite(length)||length===0)return;
    const list=graph.get(a)??[];list.push({to:b,way:w.id,length});graph.set(a,list);
  }
  for(const w of elements.filter(e=>e.type==='way')){
    const t=w.tags??{},one=onewayValue(t);let reason=null;
    if(!highwayClasses.has(t.highway))reason='not-motor-road-class';
    else if(!validGeometry(w))reason='invalid-or-incomplete-geometry';
    else if(restrictedWays.has(w.id))reason='turn-restriction-conservative-exclusion';
    else if(Object.keys(t).some(k=>relevantConditional.test(k)))reason='conditional-access-or-direction';
    else if(!accessAllowed(effectiveAccess(t)))reason='restricted-access';
    else if(t.ford&&t.ford!=='no')reason='ford';
    else if(t.area==='yes'||t.construction||t.proposed)reason='not-current-linear-road';
    else if(t.highway==='service'&&['driveway','parking_aisle','emergency_access','drive-through'].includes(t.service))reason='private-or-parking-service-purpose';
    else if(!trueValues.has(one)&&!falseValues.has(one)&&one!=='-1')reason='unknown-or-changing-oneway';
    if(reason){excluded.push({id:w.id,reason});continue;}
    w.nodes.forEach((id,i)=>nodes.set(id,[w.geometry[i].lon,w.geometry[i].lat]));acceptedWays.set(w.id,w);
    for(let i=1;i<w.nodes.length;i++){
      const a=w.nodes[i-1],b=w.nodes[i];
      if(one!=='-1'&&accessAllowed(effectiveAccess(t,'forward')))edge(a,b,w);
      if(!trueValues.has(one)&&accessAllowed(effectiveAccess(t,'backward')))edge(b,a,w);
    }
    if(suggestionClasses.has(t.highway))for(const id of w.nodes)if(!blockedNodes.has(id)&&!conflicts.has(id))ordinary.add(id);
  }
  return {nodes,graph,acceptedWays,ordinary,excluded,blockedNodes,conflicts,restrictions};
}

// Exact shared OSM node IDs alone establish intersections; geometry crossings do not.
export function shortest(network,start,end){
  if(start===null||end===null||!network.nodes.has(start)||!network.nodes.has(end))return null;
  const {graph,nodes}=network,heap=[],dist=new Map([[start,0]]),prev=new Map();
  function push(item){heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=item[0])break;heap[i]=heap[p];i=p;}heap[i]=item;}
  function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;}
  push([0,start]);
  while(heap.length){const [cost,id]=pop();if(cost!==dist.get(id))continue;if(id===end)break;for(const e of graph.get(id)??[]){const next=cost+e.length;if(next<(dist.get(e.to)??Infinity)){dist.set(e.to,next);prev.set(e.to,{from:id,...e});push([next,e.to]);}}}
  if(!dist.has(end))return null;
  const ids=[end],wayIds=[];
  while(ids.at(-1)!==start){const e=prev.get(ids.at(-1));if(!e)return null;wayIds.push(e.way);ids.push(e.from);}
  ids.reverse();wayIds.reverse();
  return {coordinates:ids.map(id=>nodes.get(id)),nodeIds:ids,wayIds:[...new Set(wayIds)],edgeWayIds:wayIds,distanceMeters:Math.round(dist.get(end))};
}

export function findSuggestion(network,village,{maxOffsetMeters=500}={}){
  let nearest=null,offset=Infinity;
  for(const id of network.ordinary){if(!network.graph.has(id))continue;const gap=distance(village.coordinates,network.nodes.get(id));if(gap<offset){nearest=id;offset=gap;}}
  const available=nearest!==null&&offset<=maxOffsetMeters;
  return {id:'suggested-'+village.id,villageId:village.id,nodeId:available?nearest:null,coordinates:available?network.nodes.get(nearest):null,status:available?'suggested-unverified':'unavailable',straightLineOffsetMeters:Number.isFinite(offset)?Math.round(offset):null,accessConnectionStatus:'unknown',note:available?'附近普通道路的计算参考点，未核验停车、过街或村内步行连接。同一锚点不代表去返程在同侧停靠。':'样本中的最近普通道路节点超出本轮500米研究搜索限值，或无合适节点；未生成建议点。限值不是步行或上下客安全标准。'};
}
function components(network){
  const links=new Map();
  function link(a,b){if(!links.has(a))links.set(a,new Set());links.get(a).add(b);}
  for(const [from,edges]of network.graph)for(const e of edges){link(from,e.to);link(e.to,from);}
  const seen=new Set(),sizes=[];
  for(const node of links.keys()){if(seen.has(node))continue;const pending=[node];seen.add(node);for(let i=0;i<pending.length;i++)for(const next of links.get(pending[i])??[])if(!seen.has(next)){seen.add(next);pending.push(next);}sizes.push(pending.length);}
  return sizes.sort((a,b)=>b-a);
}
async function main(){
  const load=async path=>JSON.parse(await readFile(path,'utf8'));
  const base=await load('data/geography/raw/roads.overpass.json'),baseSource=await load('data/geography/raw/roads.source.json');
  let supplemental=null,supplementalSource=null;
  try{supplemental=await load('data/geography/raw/route-access.overpass.json');supplementalSource=await load('data/geography/raw/route-access.source.json');}
  catch(error){if(error.code!=='ENOENT')throw error;supplemental=null;supplementalSource=null;}
  const source=supplementalSource??baseSource;
  const merged=new Map(base.elements.map(e=>[e.type+'/'+e.id,e]));
  for(const e of supplemental?.elements??[])merged.set(e.type+'/'+e.id,e);
  const network=buildGraph([...merged.values()]);
  const {mapVillages}=await import('../src/data/villages.ts');
  const order=['qingtan','longgong','xujiashan','meizhitian','ruoao'];
  const verified=order.map(id=>{const v=mapVillages.find(v=>v.id===id);if(!v)throw new Error('Missing verified village '+id);return {id,coordinates:v.normalizedCoordinate};});
  const suggestions=verified.map(v=>findSuggestion(network,v)),routes=[],edgeProofs={};
  const riskNote='道路连通研究，未核验大客车、上下客、村内连接及动态限制；不是开通线路或驾车导航。';
  for(const from of suggestions)for(const to of suggestions){
    if(from.id===to.id)continue;
    // Recompute every ordered pair over directed edges; never reverse an outbound line.
    const result=shortest(network,from.nodeId,to.nodeId),id=from.villageId+'-'+to.villageId;
    const localStreetRisk=result?.wayIds.some(wayId=>['residential','service'].includes(network.acceptedWays.get(wayId)?.tags.highway))?' 涉及居住区或服务道路，不能据此预设公交驶入村内巷道。':'';
    routes.push({id,fromVillageId:from.villageId,toVillageId:to.villageId,fromSuggestionId:from.id,toSuggestionId:to.id,source:'OpenStreetMap county major roads + bounded village access-road sample',profile:'directed-road-connectivity-research',retrievedAt:source.retrievedAt,geometryStatus:result?'source-road-geometry':'unavailable',distanceMeters:result?.distanceMeters??null,estimatedDurationSeconds:null,operatingStatus:'research-not-confirmed',coordinates:result?.coordinates??null,nodeIds:result?.nodeIds??[],wayIds:result?.wayIds??[],riskNote:riskNote+localStreetRisk,unavailableReason:result?null:(from.nodeId===null||to.nodeId===null?'至少一处古村附近没有可用的道路研究参考点。':'当前道路样本未找到满足已知方向与通行限制的连续路径；可能缺少支路或连接路。')});
    if(result)edgeProofs[id]=result.edgeWayIds;
  }
  const baseWayIds=new Set(base.elements.filter(e=>e.type==='way').map(e=>e.id));
  const accessFeatures=(supplemental?.elements??[]).filter(e=>e.type==='way'&&!baseWayIds.has(e.id)&&validGeometry(e)).map(e=>({type:'Feature',geometry:{type:'LineString',coordinates:e.geometry.map(p=>[p.lon,p.lat])},properties:{osmId:e.id,kind:e.tags.highway,name:e.tags.name??null,routingIncluded:network.acceptedWays.has(e.id)}}));
  const coverage={nodeCount:network.nodes.size,wayCount:network.acceptedWays.size,directedEdgeCount:[...network.graph.values()].reduce((n,es)=>n+es.length,0),successfulRoutes:routes.filter(r=>r.coordinates).length,requestedRoutes:routes.length,limitation:'不完整的OSM道路样本；未记录限制不等于没有限制。古村到参考点无步行或上下客核验。不同来源获取日期不同；不提供出行导航、公交时间或车辆通行保证。'};
  const result={version:'2026-10-09-road-research-v2',checkedAt:'2026-10-09',license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',attributionUrl:'https://www.openstreetmap.org/copyright',suggestions,routes,method:'Independent directed Dijkstra per ordered pair, exact shared OSM node IDs, Haversine lengths of original consecutive vertices. No village-road connector, snapping, speed or ETA. Restricted/unknown access, unresolved conditionals and ways participating in turn restrictions are conservatively excluded.',mainlineCandidate:order,mainlineStatus:'research-order-only-not-an-operating-line',excludedWays:network.excluded.length,coverage};
  const report={...coverage,checkedAt:result.checkedAt,sourceFiles:['data/geography/raw/roads.source.json',...(supplementalSource?['data/geography/raw/route-access.source.json']:[])],coordinateSystem:'EPSG:4326',transformation:'none',maxSuggestionOffsetMeters:500,offsetLimitMeaning:'Research display cutoff only, not a walking or boarding safety assessment.',suggestions,excludedWays:network.excluded,blockedNodeIds:[...network.blockedNodes],coordinateConflictNodeIds:[...network.conflicts],conservativelyExcludedRestrictionIds:network.restrictions,weaklyConnectedComponentSizes:components(network),routeEdgeWayIds:edgeProofs,routeSummaries:routes.map(({coordinates,nodeIds,wayIds,...r})=>({...r,vertexCount:coordinates?.length??0,wayIds})),sourceLicense:'ODbL-1.0',noRuntimeExternalRequests:true,unresolved:['Unknown bridge clearance, width, gradient, coach turning radius and weight limits','No verified pickup/dropoff location, side of road, waiting space or pedestrian connection','No dated restriction/closure data outside sampled OSM tags','No time, fare, timetable, route number or confirmed operating service']};
  await mkdir('public/geography',{recursive:true});await mkdir('data/geography/reports',{recursive:true});
  await writeFile('public/geography/route-research.json',JSON.stringify(result));
  await writeFile('public/geography/access-roads.geojson',JSON.stringify({type:'FeatureCollection',features:accessFeatures}));
  await writeFile('data/geography/reports/route-research.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({coverage,additionalRoadFeatures:accessFeatures.length,offsets:suggestions.map(s=>[s.villageId,s.straightLineOffsetMeters,s.status]),excludedReasons:Object.fromEntries([...new Set(network.excluded.map(e=>e.reason))].map(reason=>[reason,network.excluded.filter(e=>e.reason===reason).length]))},null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
