import type { StyleSpecification } from 'maplibre-gl';

// Structural GeoJSON subset used by our local data; no additional runtime or type package.
export type LineString = { type:'LineString'; coordinates:number[][] };
export type MultiLineString = { type:'MultiLineString'; coordinates:number[][][] };
export type Polygon = { type:'Polygon'; coordinates:number[][][] };
export type FeatureCollection = { type:'FeatureCollection'; features:{type:'Feature';properties:Record<string,unknown>|null;geometry:LineString|MultiLineString|Polygon|{type:'MultiPolygon';coordinates:number[][][][]}|{type:'Point';coordinates:number[]}}[] };

export type MapScope = 'county' | 'route' | 'village';
export type MapDepth = 'flat' | 'relief';
export type MapPresentation = 'card' | 'scene';
export type MapViewportInsets = { top:number; bottom:number; left:number; right:number };
export type MapRoute = { id: string; geometry: LineString | MultiLineString | null; geometryStatus?: string };
export type MapBoardingPoint = { id: string; name: string; coordinates: [number, number]; status: 'suggested' | 'verified'; villageId?: string };
export type MapDetail = { crs: string; layers: Record<'buildings' | 'detail-roads' | 'detail-water', string>; villageBuildingCounts: Record<string, number> };
export const emptyCollection: FeatureCollection = { type: 'FeatureCollection', features: [] };
export const scopeNames: Record<MapScope,string> = { county:'全县古村',route:'当前区间',village:'村落局部' };

export function mapStyle(base: FeatureCollection[], detail: FeatureCollection[], presentation:MapPresentation='card'): StyleSpecification {
  const scene=presentation==='scene';
  return {
    version:8,
    light:{anchor:'viewport',color:'#fff6e8',intensity:.35,position:[1.5,220,38]},
    sources:{
      boundary:{type:'geojson',data:base[0]},roads:{type:'geojson',data:base[1]},water:{type:'geojson',data:base[2]},
      buildings:{type:'geojson',data:detail[0]},'detail-roads':{type:'geojson',data:detail[1]},'detail-water':{type:'geojson',data:detail[2]},
      proposal:{type:'geojson',data:emptyCollection},
    },
    layers:[
      {id:'paper',type:'background',paint:{'background-color':scene?'#F4F0E6':'#DEDCCF'}},
      {id:'county',type:'fill',source:'boundary',paint:{'fill-color':'#F4F0E6'}},
      {id:'water-area',type:'fill',source:'water',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':scene?'#C1D1CA':'#ABC3BF'}},
      {id:'water-line',type:'line',source:'water',paint:{'line-color':scene?'#AEC3BA':'#82A5A7','line-width':['interpolate',['linear'],['zoom'],8,.7,13,scene?1.7:2.5,17,scene?3.5:5]}},
      {id:'detail-water',type:'line',source:'detail-water',minzoom:scene?11:13,paint:{'line-color':scene?'#AEC3BA':'#82A5A7','line-width':['interpolate',['linear'],['zoom'],11,.7,13,1.3,17,4]}},
      {id:'road-case',type:'line',source:'roads',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':scene?'#C2C8BA':'#B3B8A9','line-width':['interpolate',['linear'],['zoom'],8,1.3,13,scene?3.4:5,17,scene?9:14]}},
      {id:'roads',type:'line',source:'roads',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':scene?'#FBF8EF':'#FDF9EC','line-width':['interpolate',['linear'],['zoom'],8,.6,13,scene?1.8:3,17,scene?6:10]}},
      {id:'local-road-case',type:'line',source:'detail-roads',minzoom:scene?10.5:12,filter:['==',['get','movement'],'road'],paint:{'line-color':scene?'#C8CCBF':'#B4B9AC','line-width':['interpolate',['linear'],['zoom'],10.5,.8,12,1,17,scene?7:11]}},
      {id:'local-roads',type:'line',source:'detail-roads',minzoom:scene?10.5:12,filter:['==',['get','movement'],'road'],paint:{'line-color':scene?'#FBF8EF':'#FFFBEE','line-width':['interpolate',['linear'],['zoom'],10.5,.4,12,.5,17,scene?4.5:8]}},
      {id:'local-paths',type:'line',source:'detail-roads',minzoom:14,filter:['==',['get','movement'],'non-motor'],paint:{'line-color':'#A69E87','line-width':1.5,'line-dasharray':[2,2]}},
      {id:'building-footprints',type:'fill',source:'buildings',minzoom:14,paint:{'fill-color':'#CEC5B0','fill-outline-color':'#9C9684','fill-opacity':.92}},
      {id:'building-models',type:'fill-extrusion',source:'buildings',minzoom:14,layout:{visibility:'none'},paint:{'fill-extrusion-color':'#E7DFCB','fill-extrusion-height':['get','displayHeight'],'fill-extrusion-base':0,'fill-extrusion-opacity':1}},
      {id:'proposal-case',type:'line',source:'proposal',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#F4F0E6','line-width':8}},
      {id:'proposal-line',type:'line',source:'proposal',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#355B5A','line-width':4.5}},
      {id:'county-edge',type:'line',source:'boundary',layout:{visibility:scene?'none':'visible'},paint:{'line-color':'#5D7877','line-width':1.8}},
    ],
  };
}
