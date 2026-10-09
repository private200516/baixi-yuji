import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const source = read('data/geography/raw/village-detail.source.json');
const raw = read(source.rawFile);
const valid = pair => pair.length === 2 && pair.every(Number.isFinite) && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90;
const buildings = [], roads = [], water = [], skipped = [];
for (const element of raw.elements) {
  if (element.type !== 'way' || !Array.isArray(element.geometry)) continue;
  const coordinates = element.geometry.map(point => [point.lon, point.lat]);
  if (coordinates.length < 2 || !coordinates.every(valid)) { skipped.push({ id: element.id, reason: 'invalid-geometry' }); continue; }
  const properties = { osmId: element.id, name: element.tags?.name ?? null, sourceUrl: `https://www.openstreetmap.org/way/${element.id}`, ...element.tags };
  if (element.tags?.building) {
    if (coordinates.length < 4 || coordinates[0].some((value, index) => value !== coordinates.at(-1)[index])) { skipped.push({ id: element.id, reason: 'building-is-not-closed' }); continue; }
    const mean = coordinates.slice(0, -1).reduce((total, point) => [total[0] + point[0], total[1] + point[1]], [0, 0]).map(value => value / (coordinates.length - 1));
    const nearest = [...source.queryCoverage].sort((a, b) => (a.lon-mean[0]) ** 2 + (a.lat-mean[1]) ** 2 - ((b.lon-mean[0]) ** 2 + (b.lat-mean[1]) ** 2))[0];
    const mappedHeight = /^\d+(\.\d+)?\s*(m)?$/.test(element.tags.height ?? '') ? Number.parseFloat(element.tags.height) : null;
    properties.villageId = nearest.id;
    properties.displayHeight = mappedHeight && mappedHeight <= 100 ? mappedHeight : 6;
    properties.heightSource = mappedHeight && mappedHeight <= 100 ? 'osm-height-tag' : 'illustrative-uniform-6m';
    properties.heightNote = properties.heightSource === 'osm-height-tag' ? 'OSM 标注高度，未经实测复核' : '建筑高度为统一 6 米示意，不是测量值';
    buildings.push({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [coordinates] } });
  } else if (element.tags?.highway) {
    properties.movement = /^(footway|path|pedestrian|steps|cycleway|bridleway)$/.test(element.tags.highway) ? 'non-motor' : 'road';
    roads.push({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
  } else if (element.tags?.waterway) {
    water.push({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
  }
}
const layers = {}, checksums = {};
for (const [name, features] of Object.entries({ buildings, 'detail-roads': roads, 'detail-water': water })) {
  const path = `public/geography/${name}.geojson`, content = JSON.stringify({ type: 'FeatureCollection', features });
  writeFileSync(path, content + '\n');
  layers[name] = `geography/${name}.geojson`;
  checksums[path] = createHash('sha256').update(content + '\n').digest('hex');
}
const manifest = {
  id: 'ninghai-village-detail-2026-10-09', crs: 'EPSG:4326', sourceRetrievedAt: source.retrievedAt,
  layers, counts: { buildings: buildings.length, roads: roads.length, water: water.length },
  villageBuildingCounts: Object.fromEntries(source.queryCoverage.map(point => [point.id, buildings.filter(feature => feature.properties.villageId === point.id).length])),
  buildingHeightNote: '建筑高度为示意；仅显示实际取得的 OSM 轮廓，不代表完整村落建筑。',
  coverageNote: '五处代表点各 1 公里范围内的 OSM 方式对象；未取得完整建筑覆盖或 DEM。无数据处保持空白。',
  attribution: { label: source.attribution, url: source.attributionUrl, license: source.license },
};
writeFileSync('public/geography/detail-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
writeFileSync('data/geography/village-detail-report.json', JSON.stringify({ ...manifest, checksums, skipped, coordinateConversion: 'None; original WGS84 geometry vertices retained in longitude,latitude order.', boundaryRule: '1 km around each village point is query scope, not an official village boundary.', buildingValidation: 'Only closed ways with at least 4 valid coordinate pairs accepted; no invented footprints or inferred missing geometry.' }, null, 2) + '\n');
console.log(JSON.stringify({ counts: manifest.counts, villageBuildingCounts: manifest.villageBuildingCounts, skipped }, null, 2));
