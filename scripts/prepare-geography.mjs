import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const raw = 'data/geography/raw/';
await mkdir('public/geography', { recursive: true });
const load = async name => JSON.parse(await readFile(raw + name + '.overpass.json', 'utf8'));
const position = p => [p.lon, p.lat];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
// Join only identical OSM endpoints. Never snap, invent or relocate a vertex.
export function rings(members, role) {
  const pending = members.filter(m => m.type === 'way' && m.role === role && m.geometry).map(m => m.geometry.map(position));
  const result = [];
  while (pending.length) {
    let ring = pending.shift();
    while (!same(ring[0], ring.at(-1))) {
      const i = pending.findIndex(p => same(ring.at(-1), p[0]) || same(ring.at(-1), p.at(-1)));
      if (i < 0) throw new Error('Unclosed OSM boundary: refusing fabricated closure');
      let next = pending.splice(i, 1)[0];
      if (!same(ring.at(-1), next[0])) next = next.toReversed();
      ring.push(...next.slice(1));
    }
    if (ring.length < 4) throw new Error('Invalid polygon ring');
    result.push(ring);
  }
  return result;
}
export function inRing([x,y], ring) {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,yi]=ring[i], [xj,yj]=ring[j];
    if ((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
const relation = (await load('boundary')).elements.find(e=>e.type==='relation' && e.id===3199272);
const outer = rings(relation.members, 'outer'), inner = rings(relation.members, 'inner');
const polygons = outer.map(r => [r, ...inner.filter(h=>inRing(h[0],r))]);
const feature = (geometry, properties) => ({type:'Feature',geometry,properties});
const collection = features => ({type:'FeatureCollection',features});
const boundary = collection([feature({type:'MultiPolygon',coordinates:polygons},{name:'宁海县',osmId:3199272})]);
const roads = collection((await load('roads')).elements.filter(e=>e.type==='way' && e.geometry?.length>1).map(e=>feature({type:'LineString',coordinates:e.geometry.map(position)},{osmId:e.id,kind:e.tags.highway,name:e.tags.name??null})));
const waterElements = (await load('water')).elements;
const water = collection(waterElements.filter(e=>e.type==='way' && e.geometry?.length>1).map(e=>{
  const points=e.geometry.map(position);
  const closed=e.tags.natural==='water' && points.length>=4 && same(points[0],points.at(-1));
  return feature({type:closed?'Polygon':'LineString',coordinates:closed?[points]:points},{osmId:e.id,kind:closed?'water':e.tags.waterway??'water-edge',name:e.tags.name??null});
}));
const vertices=outer.flat(), extent=[Math.min(...vertices.map(p=>p[0])),Math.min(...vertices.map(p=>p[1])),Math.max(...vertices.map(p=>p[0])),Math.max(...vertices.map(p=>p[1]))];
const hashes={},counts={};
for (const [name,data] of Object.entries({boundary,roads,water})) {
  const text=JSON.stringify(data); await writeFile(`public/geography/${name}.geojson`,text); hashes[name]=createHash('sha256').update(text).digest('hex');counts[name]=data.features.length;
}
const manifest={id:'ninghai-osm-2026-10-08',title:'宁海县二维地理样本',checkedAt:'2026-10-08',crs:'EPSG:4326',extent,coverageNote:'县域 OSM 样本；主要道路与已绘制水系，非完整街道图。未核实道路通行性、接驳站点和公交班次。',attribution:{label:'© OpenStreetMap contributors',url:'https://www.openstreetmap.org/copyright',license:'ODbL-1.0'},layers:{boundary:'geography/boundary.geojson',roads:'geography/roads.geojson',water:'geography/water.geojson'},counts,hashes};
await writeFile('public/geography/manifest.json',JSON.stringify(manifest,null,2));
await writeFile('data/geography/extraction-report.json',JSON.stringify({checkedAt:manifest.checkedAt,extent,counts,hashes,outerRings:outer.length,innerRings:inner.length,unassignedHoles:inner.filter(h=>!outer.some(r=>inRing(h[0],r))).length,conversion:'WGS84 unchanged; endpoint assembly only. No GCJ02 conversion, smoothing, random points or road routing.',waterNote:'Way geometry only; multipolygon relation assembly is not included. Closed water ways are polygons; other water edges remain lines.',excludedWaterRelations:waterElements.filter(e=>e.type==='relation').length},null,2));
console.log({extent,counts,outerRings:outer.length,innerRings:inner.length});
